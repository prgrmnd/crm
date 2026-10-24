const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

// PB-052: usuarios, sessoes e tentativas_login.
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

async function inserirUsuario(client, overrides = {}) {
  const dados = {
    nome: 'Ana Administradora',
    email: 'ana@luz.example',
    senha_hash: SENHA_HASH,
    perfil: 'administrador',
    criado_por: null,
    ...overrides,
  };
  const result = await client.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, criado_por)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [dados.nome, dados.email, dados.senha_hash, dados.perfil, dados.criado_por],
  );
  return result.rows[0];
}

testWithDatabase('[PB-052] migration de acesso está aplicada', async (client) => {
  const applied = await client.query(
    `SELECT migration_name FROM "_prisma_migrations"
     WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    ['20261023100000_create_tabelas_acesso'],
  );
  assert.equal(applied.rowCount, 1);
});

testWithDatabase('[PB-052] usuarios persiste credencial argon2id com padrões do WBS', async (client) => {
  const admin = await inserirUsuario(client);
  assert.match(admin.id, /^[0-9a-f-]{36}$/i);
  assert.equal(admin.ativo, true);
  assert.equal(admin.versao, 1);
  assert.equal(admin.criado_por, null, 'bootstrap do primeiro administrador sem autor');
  assert.ok(admin.senha_alterada_em instanceof Date);
  assert.ok(admin.atualizado_em instanceof Date);

  const operador = await inserirUsuario(client, {
    nome: 'Otávio Operador',
    email: 'otavio@luz.example',
    perfil: 'operador_captacao',
    criado_por: admin.id,
  });
  assert.equal(operador.criado_por, admin.id);
});

testWithDatabase('[PB-052] nunca armazena senha reversível', async (client) => {
  for (const senhaHash of [
    'minhaSenha123',
    '$2b$12$abcdefghijklmnopqrstuuJ3sYbGqgf3a2kLz9Q2c5o7l0o1QeW1e',
    '$argon2i$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
    '$argon2id$v=19$m=65536,t=3,p=4$$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
  ]) {
    await expectRejection(
      client,
      `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('X', 'x@luz.example', $1, 'administrador')`,
      [senhaHash],
      '23514',
      `senha_hash fora do formato argon2id deve ser rejeitado: ${senhaHash}`,
    );
  }
});

testWithDatabase('[PB-052] perfil restrito a administrador ou operador_captacao', async (client) => {
  for (const perfil of ['admin', 'operador', 'gestor', '']) {
    await expectRejection(
      client,
      `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('X', 'x@luz.example', $1, $2)`,
      [SENHA_HASH, perfil],
      '23514',
      `perfil ${perfil} deve ser rejeitado`,
    );
  }
});

testWithDatabase('[PB-052] e-mail único após lower(trim(email))', async (client) => {
  await inserirUsuario(client, { email: 'ana@luz.example' });
  await expectRejection(
    client,
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Ana 2', $1, $2, 'administrador')`,
    ['  ANA@Luz.Example ', SENHA_HASH],
    '23505',
    'e-mail repetido com caixa/espaços diferentes deve violar a unicidade',
  );
  await expectRejection(
    client,
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Sem arroba', 'sem-arroba', $1, 'administrador')`,
    [SENHA_HASH],
    '23514',
    'e-mail sem formato mínimo deve ser rejeitado',
  );
});

testWithDatabase('[PB-052] usuarios valida versao, nome, autor e mantém atualizado_em', async (client) => {
  await expectRejection(
    client,
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, versao) VALUES ('X', 'x@luz.example', $1, 'administrador', 0)`,
    [SENHA_HASH],
    '23514',
    'versao deve ser positiva',
  );
  await expectRejection(
    client,
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('   ', 'x@luz.example', $1, 'administrador')`,
    [SENHA_HASH],
    '23514',
    'nome não pode ser vazio',
  );
  await expectRejection(
    client,
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, criado_por) VALUES ('X', 'x@luz.example', $1, 'administrador', gen_random_uuid())`,
    [SENHA_HASH],
    '23503',
    'criado_por deve referenciar um usuário existente',
  );

  const usuario = await inserirUsuario(client);
  await client.query(`UPDATE usuarios SET atualizado_em = '2000-01-01T00:00:00Z' WHERE id = $1`, [usuario.id]);
  const atualizado = await client.query('SELECT atualizado_em FROM usuarios WHERE id = $1', [usuario.id]);
  assert.ok(
    atualizado.rows[0].atualizado_em.getFullYear() > 2000,
    'atualizado_em deve ser mantido pelo trigger em cada UPDATE',
  );

  await client.query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [usuario.id]);
  const inativo = await client.query('SELECT ativo FROM usuarios WHERE id = $1', [usuario.id]);
  assert.equal(inativo.rows[0].ativo, false, 'inativação é uma atualização, não remoção');
});

testWithDatabase('[PB-052] usuário com autoria não pode ser removido fisicamente', async (client) => {
  const admin = await inserirUsuario(client);
  await inserirUsuario(client, { email: 'op@luz.example', perfil: 'operador_captacao', criado_por: admin.id });
  await expectRejection(
    client,
    'DELETE FROM usuarios WHERE id = $1',
    [admin.id],
    '23503',
    'inativação preserva autoria; remoção com dependentes deve falhar',
  );
});

testWithDatabase('[PB-052] sessoes guarda apenas hash do token e valida prazos', async (client) => {
  const usuario = await inserirUsuario(client);
  const tokenHash = sha256('token-bruto-que-fica-so-no-navegador');

  const sessao = await client.query(
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em, ip, agente_usuario)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 minutes', '192.168.0.10', 'Mozilla/5.0')
     RETURNING *`,
    [usuario.id, tokenHash],
  );
  assert.equal(sessao.rows[0].token_hash, tokenHash);
  assert.equal(sessao.rows[0].revogada_em, null);
  assert.ok(sessao.rows[0].ultimo_acesso_em instanceof Date);

  await expectRejection(
    client,
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
    [usuario.id, 'token-bruto-que-fica-so-no-navegador'],
    '23514',
    'token bruto não pode ser gravado',
  );
  await expectRejection(
    client,
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
    [usuario.id, tokenHash],
    '23505',
    'token_hash deve ser único',
  );
  await expectRejection(
    client,
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
    [usuario.id, sha256('outro')],
    '23514',
    'expiração deve ser posterior à criação',
  );
  await expectRejection(
    client,
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
    [sha256('sem-dono')],
    '23503',
    'sessão exige usuário existente',
  );

  await client.query('UPDATE sessoes SET revogada_em = CURRENT_TIMESTAMP WHERE id = $1', [sessao.rows[0].id]);
  const revogada = await client.query('SELECT revogada_em FROM sessoes WHERE id = $1', [sessao.rows[0].id]);
  assert.ok(revogada.rows[0].revogada_em instanceof Date, 'sessão deve ser revogável');
});

testWithDatabase('[PB-052] tentativas_login aceita conta inexistente e protege o identificador', async (client) => {
  const usuario = await inserirUsuario(client);
  const identificador = sha256('ana@luz.example');

  await client.query(
    `INSERT INTO tentativas_login (usuario_id, identificador_hash, ip, sucesso)
     VALUES ($1, $2, '10.0.0.1', FALSE)`,
    [usuario.id, identificador],
  );
  const inexistente = await client.query(
    `INSERT INTO tentativas_login (identificador_hash, ip, sucesso, bloqueado_ate)
     VALUES ($1, '10.0.0.1', FALSE, CURRENT_TIMESTAMP + INTERVAL '1 minute')
     RETURNING usuario_id, bloqueado_ate`,
    [sha256('nao-existe@luz.example')],
  );
  assert.equal(inexistente.rows[0].usuario_id, null);
  assert.ok(inexistente.rows[0].bloqueado_ate instanceof Date);

  await expectRejection(
    client,
    `INSERT INTO tentativas_login (identificador_hash, sucesso) VALUES ('ana@luz.example', FALSE)`,
    [],
    '23514',
    'identificador deve ser hash, nunca o e-mail em texto',
  );
  await expectRejection(
    client,
    `INSERT INTO tentativas_login (identificador_hash, sucesso, bloqueado_ate)
     VALUES ($1, FALSE, CURRENT_TIMESTAMP - INTERVAL '1 minute')`,
    [identificador],
    '23514',
    'bloqueio deve terminar depois da tentativa',
  );
  await expectRejection(
    client,
    `INSERT INTO tentativas_login (identificador_hash, sucesso, bloqueado_ate)
     VALUES ($1, TRUE, CURRENT_TIMESTAMP + INTERVAL '1 minute')`,
    [identificador],
    '23514',
    'tentativa com sucesso não aplica bloqueio',
  );
});

testWithDatabase('[PB-052] índices de suporte do WBS existem', async (client) => {
  const result = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename IN ('usuarios', 'sessoes', 'tentativas_login')`,
  );
  const indices = Object.fromEntries(result.rows.map((row) => [row.indexname, row.indexdef]));

  assert.match(indices.usuarios_email_normalizado_unico, /UNIQUE INDEX .*lower\(TRIM\(BOTH FROM email\)\)/i);
  assert.match(indices.sessoes_usuario_id_idx, /\(usuario_id\)/);
  assert.match(indices.sessoes_expira_em_idx, /\(expira_em\)/);
  assert.match(indices.tentativas_login_identificador_criado_em_idx, /\(identificador_hash, criado_em\)/);
  assert.match(indices.tentativas_login_ip_criado_em_idx, /\(ip, criado_em\)/);
});
