const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

// PB-053: tokens_recuperacao.
const SENHA_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0';
const sha256 = (valor) => crypto.createHash('sha256').update(valor).digest('hex');

async function expectRejection(client, sql, params, code, message) {
  await client.query('SAVEPOINT expected_failure');
  try {
    await assert.rejects(client.query(sql, params), (error) => error.code === code, message);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    await client.query('RELEASE SAVEPOINT expected_failure');
  }
}

async function inserirUsuario(client, email = 'ana@luz.example') {
  const { rows } = await client.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil)
     VALUES ('Ana', $1, $2, 'administrador') RETURNING id`,
    [email, SENHA_HASH],
  );
  return rows[0].id;
}

testWithDatabase('[PB-053] migration de tokens de recuperação está aplicada', async (client) => {
  const applied = await client.query(
    `SELECT migration_name FROM "_prisma_migrations"
     WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    ['20261023120000_create_tokens_recuperacao'],
  );
  assert.equal(applied.rowCount, 1);
});

testWithDatabase('[PB-053] guarda só o hash, vinculado ao usuário, expirando em 15 minutos', async (client) => {
  const usuarioId = await inserirUsuario(client);
  const tokenBruto = crypto.randomBytes(32).toString('base64url');

  const { rows } = await client.query(
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2)
     RETURNING *, EXTRACT(EPOCH FROM expira_em - criado_em)::int AS validade_segundos`,
    [usuarioId, sha256(tokenBruto)],
  );
  const token = rows[0];
  assert.equal(token.usuario_id, usuarioId);
  assert.equal(token.token_hash, sha256(tokenBruto));
  assert.notEqual(token.token_hash, tokenBruto);
  assert.equal(token.validade_segundos, 15 * 60, 'expiração padrão de exatamente 15 minutos');
  assert.equal(token.consumido_em, null);
  assert.equal(token.invalidado_em, null);

  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2)`,
    [usuarioId, tokenBruto],
    '23514',
    'token bruto não pode ser persistido',
  );
  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES (gen_random_uuid(), $1)`,
    [sha256('sem-usuario')],
    '23503',
    'token deve pertencer a um usuário existente',
  );
  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES (NULL, $1)`,
    [sha256('usuario-nulo')],
    '23502',
    'usuario_id é obrigatório',
  );
});

testWithDatabase('[PB-053] expiração é obrigatória e limitada a 15 minutos', async (client) => {
  const usuarioId = await inserirUsuario(client);
  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash, expira_em)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '16 minutes')`,
    [usuarioId, sha256('longo')],
    '23514',
    'prazo acima de 15 minutos deve ser rejeitado',
  );
  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash, expira_em) VALUES ($1, $2, NULL)`,
    [usuarioId, sha256('sem-prazo')],
    '23502',
    'expira_em não pode ser nulo',
  );
  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash, expira_em) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
    [usuarioId, sha256('expirado')],
    '23514',
    'expiração deve ser posterior à criação',
  );

  const curto = await client.query(
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash, expira_em)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes') RETURNING id`,
    [usuarioId, sha256('curto')],
  );
  assert.equal(curto.rowCount, 1, 'prazo menor que 15 minutos é aceito');
});

testWithDatabase('[PB-053] permite um único token ativo e invalidação dos anteriores', async (client) => {
  const usuarioId = await inserirUsuario(client);
  const outroUsuarioId = await inserirUsuario(client, 'bia@luz.example');
  const primeiro = await client.query(
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2) RETURNING id`,
    [usuarioId, sha256('primeiro')],
  );

  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2)`,
    [usuarioId, sha256('segundo')],
    '23505',
    'novo token exige invalidar o anterior',
  );
  await client.query(
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2)`,
    [outroUsuarioId, sha256('de-outro-usuario')],
  );

  await client.query(
    `UPDATE tokens_recuperacao SET invalidado_em = CURRENT_TIMESTAMP
     WHERE usuario_id = $1 AND consumido_em IS NULL AND invalidado_em IS NULL`,
    [usuarioId],
  );
  const segundo = await client.query(
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2) RETURNING id`,
    [usuarioId, sha256('segundo')],
  );
  assert.equal(segundo.rowCount, 1);

  await expectRejection(
    client,
    `UPDATE tokens_recuperacao SET consumido_em = CURRENT_TIMESTAMP WHERE id = $1`,
    [primeiro.rows[0].id],
    '55000',
    'token invalidado não pode ser consumido',
  );
});

testWithDatabase('[PB-053] consumo é único e definitivo', async (client) => {
  const usuarioId = await inserirUsuario(client);
  const { rows } = await client.query(
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2) RETURNING id`,
    [usuarioId, sha256('uso-unico')],
  );
  const tokenId = rows[0].id;

  const consumo = await client.query(
    `UPDATE tokens_recuperacao SET consumido_em = CURRENT_TIMESTAMP
     WHERE id = $1 AND consumido_em IS NULL AND invalidado_em IS NULL AND expira_em > CURRENT_TIMESTAMP`,
    [tokenId],
  );
  assert.equal(consumo.rowCount, 1);

  await expectRejection(
    client,
    `UPDATE tokens_recuperacao SET consumido_em = NULL WHERE id = $1`,
    [tokenId],
    '55000',
    'consumo não pode ser desfeito',
  );
  await expectRejection(
    client,
    `UPDATE tokens_recuperacao SET invalidado_em = CURRENT_TIMESTAMP WHERE id = $1`,
    [tokenId],
    '55000',
    'token consumido é estado final',
  );
});

testWithDatabase('[PB-053] campos de identidade e prazo do token são imutáveis', async (client) => {
  const usuarioId = await inserirUsuario(client);
  const { rows } = await client.query(
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash) VALUES ($1, $2) RETURNING id`,
    [usuarioId, sha256('imutavel')],
  );
  await expectRejection(
    client,
    `UPDATE tokens_recuperacao SET expira_em = expira_em - INTERVAL '1 minute' WHERE id = $1`,
    [rows[0].id],
    '55000',
    'prazo não pode ser alterado após a emissão',
  );
  await expectRejection(
    client,
    `UPDATE tokens_recuperacao SET token_hash = $2 WHERE id = $1`,
    [rows[0].id, sha256('trocado')],
    '55000',
    'hash não pode ser trocado',
  );
  await expectRejection(
    client,
    `INSERT INTO tokens_recuperacao (usuario_id, token_hash, criado_em, expira_em, consumido_em)
     VALUES ($1, $2, CURRENT_TIMESTAMP - INTERVAL '20 minutes',
             CURRENT_TIMESTAMP - INTERVAL '5 minutes', CURRENT_TIMESTAMP)`,
    [usuarioId, sha256('consumido-apos-expirar')],
    '23514',
    'consumo depois da expiração deve ser rejeitado',
  );
});

testWithDatabase('[PB-053] índices de suporte existem', async (client) => {
  const { rows } = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tokens_recuperacao'`,
  );
  const indices = Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
  assert.match(indices.tokens_recuperacao_usuario_expira_em_idx, /\(usuario_id, expira_em\)/);
  assert.match(indices.tokens_recuperacao_um_ativo_por_usuario, /UNIQUE INDEX .*WHERE \(\(consumido_em IS NULL\) AND \(invalidado_em IS NULL\)\)/);
  assert.match(indices.tokens_recuperacao_token_hash_unico, /UNIQUE INDEX .*\(token_hash\)/);
});
