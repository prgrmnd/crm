const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

async function fixture(client) {
  const usuario = await client.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil)
     VALUES ('Operador de teste', 'operador-contatos@luz.example', $1, 'operador_captacao') RETURNING id`,
    ['$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0'],
  );
  const origem = await client.query("SELECT id FROM origens WHERE codigo = 'whatsapp'");
  const etapa = await client.query('SELECT id FROM etapas_captacao WHERE ordem = 1');
  return {
    tipo_pessoa: 'PF', nome: 'Contato de teste', email: 'contato@luz.example',
    telefone: null, documento: null, origem_id: origem.rows[0].id,
    classificacao: 'outbound', etapa_captacao_id: etapa.rows[0].id,
    responsavel_id: usuario.rows[0].id, criado_por: usuario.rows[0].id,
    data_cadastro: '2020-01-02T12:00:00Z',
  };
}

async function inserir(client, dados, overrides = {}) {
  const row = { ...dados, ...overrides };
  const columns = Object.keys(row);
  const result = await client.query(
    `INSERT INTO contatos (${columns.join(', ')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`,
    Object.values(row),
  );
  return result.rows[0];
}

async function rejeita(client, operacao, codigo, constraint) {
  await client.query('SAVEPOINT invalid_contact');
  try {
    await assert.rejects(operacao, (error) => {
      assert.equal(error.code, codigo);
      if (constraint) assert.equal(error.constraint, constraint);
      return true;
    });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_contact');
    await client.query('RELEASE SAVEPOINT invalid_contact');
  }
}

testWithDatabase('[PB-057] migration cria cadastro com padrões, datas e FKs do WBS', async (client) => {
  const migration = await client.query(
    `SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261023130000_create_contatos'
     AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  assert.equal(migration.rowCount, 1);
  const dados = await fixture(client);
  const contato = await inserir(client, dados);
  assert.match(contato.id, /^[0-9a-f-]{36}$/i);
  assert.equal(contato.versao, 1);
  assert.equal(contato.excluido_em, null);
  assert.ok(contato.criado_em instanceof Date);
  assert.ok(contato.atualizado_em instanceof Date);
  assert.equal(contato.data_cadastro.toISOString(), '2020-01-02T12:00:00.000Z');
  const read = await client.query('SELECT * FROM contatos WHERE id = $1', [contato.id]);
  assert.deepEqual(read.rows[0], contato);
});

testWithDatabase('[PB-057] normaliza e-mail e preserva unicidade global após exclusão lógica', async (client) => {
  const dados = await fixture(client);
  const contato = await inserir(client, dados, { email: '  Contato@LUZ.example  ' });
  assert.equal(contato.email, 'contato@luz.example');
  await client.query('UPDATE contatos SET excluido_em = CURRENT_TIMESTAMP WHERE id = $1', [contato.id]);
  await rejeita(client, () => inserir(client, dados, { email: ' CONTATO@luz.example ' }), '23505', 'contatos_email_unico');
  const outro = await inserir(client, dados, { email: 'outro@luz.example' });
  await rejeita(client, () => client.query('UPDATE contatos SET email = $1 WHERE id = $2', ['CONTATO@luz.example', outro.id]), '23505', 'contatos_email_unico');
});

testWithDatabase('[PB-057] permite telefone sem e-mail e múltiplos valores opcionais nulos', async (client) => {
  const dados = await fixture(client);
  for (const email of ['', '   ', null]) {
    const contato = await inserir(client, dados, { email, telefone: '86999999999', documento: '' });
    assert.equal(contato.email, null);
    assert.equal(contato.documento, null);
  }
  const contato = await inserir(client, dados, { telefone: '   ', documento: '   ' });
  assert.equal(contato.telefone, null);
  assert.equal(contato.documento, null);
});

testWithDatabase('[PB-057] CHECK exige e-mail ou telefone no INSERT e UPDATE', async (client) => {
  const dados = await fixture(client);
  for (const email of [null, '', '   ']) {
    await rejeita(client, () => inserir(client, dados, { email, telefone: ' ' }), '23514', 'contatos_meio_comunicacao_obrigatorio');
  }
  const contato = await inserir(client, dados);
  await rejeita(client, () => client.query("UPDATE contatos SET email = '', telefone = NULL WHERE id = $1", [contato.id]), '23514', 'contatos_meio_comunicacao_obrigatorio');
});

testWithDatabase('[PB-057] valida CPF/CNPJ por tipo e dígitos verificadores', async (client) => {
  const dados = await fixture(client);
  for (const [tipo_pessoa, documento] of [['PF', '52998224725'], ['PF', '01234567890'], ['PJ', '11222333000181']]) {
    const contato = await inserir(client, dados, { email: null, telefone: '8633334444', tipo_pessoa, documento });
    assert.equal(contato.documento, documento);
  }
  for (const [tipo_pessoa, documento] of [
    ['PF', '52998224724'], ['PF', '52998224715'], ['PF', '11111111111'],
    ['PF', '123'], ['PF', '529.982.247-25'], ['PJ', '11222333000180'],
    ['PJ', '11222333000171'], ['PJ', '00000000000000'],
    ['PF', '11222333000181'], ['PJ', '52998224725'], ['PF', 'abcdefghijk'],
  ]) {
    await rejeita(client, () => inserir(client, dados, { tipo_pessoa, documento }), '23514', 'contatos_documento_valido');
  }
});

testWithDatabase('[PB-057] documento permanece único inclusive após exclusão e em updates', async (client) => {
  const dados = await fixture(client);
  const contato = await inserir(client, dados, { documento: '52998224725' });
  await client.query('UPDATE contatos SET excluido_em = CURRENT_TIMESTAMP WHERE id = $1', [contato.id]);
  await rejeita(client, () => inserir(client, dados, { email: 'segundo@luz.example', documento: '52998224725' }), '23505', 'contatos_documento_unico');
  const outro = await inserir(client, dados, { email: 'terceiro@luz.example' });
  await rejeita(client, () => client.query('UPDATE contatos SET documento = $1 WHERE id = $2', ['52998224725', outro.id]), '23505', 'contatos_documento_unico');
});

testWithDatabase('[PB-057] rejeita nome, perfil de pessoa, classificação, telefone e e-mail inválidos', async (client) => {
  const dados = await fixture(client);
  for (const [campo, valor, constraint] of [
    ['nome', '   ', 'contatos_nome_nao_vazio'],
    ['tipo_pessoa', 'XX', 'contatos_tipo_pessoa_valido'],
    ['classificacao', 'manual', 'contatos_classificacao_valida'],
    ['telefone', '123', 'contatos_telefone_formato'],
    ['telefone', '86-99999999', 'contatos_telefone_formato'],
    ['email', 'sem-arroba', 'contatos_email_formato'],
    ['email', 'nome @luz.example', 'contatos_email_formato'],
    ['versao', 0, 'contatos_versao_positiva'],
    ['versao', -1, 'contatos_versao_positiva'],
  ]) await rejeita(client, () => inserir(client, dados, { [campo]: valor }), '23514', constraint);
  for (const campo of ['nome', 'tipo_pessoa', 'classificacao', 'origem_id', 'etapa_captacao_id', 'responsavel_id', 'criado_por', 'data_cadastro', 'versao']) {
    await rejeita(client, () => inserir(client, dados, { [campo]: null }), '23502');
  }
});

testWithDatabase('[PB-057] impede referências inexistentes e preserva autoria na remoção de usuário', async (client) => {
  const dados = await fixture(client);
  for (const [campo, constraint] of [
    ['origem_id', 'contatos_origem_id_fkey'], ['etapa_captacao_id', 'contatos_etapa_captacao_id_fkey'],
    ['responsavel_id', 'contatos_responsavel_id_fkey'], ['criado_por', 'contatos_criado_por_fkey'],
  ]) {
    await rejeita(client, () => inserir(client, dados, { [campo]: randomUUID() }), '23503', constraint);
  }
  const contato = await inserir(client, dados);
  await rejeita(client, () => client.query('UPDATE contatos SET responsavel_id = $1 WHERE id = $2', [randomUUID(), contato.id]), '23503', 'contatos_responsavel_id_fkey');
  await rejeita(client, () => client.query('DELETE FROM usuarios WHERE id = $1', [dados.responsavel_id]), '23503');
  await client.query('UPDATE usuarios SET ativo = false WHERE id = $1', [dados.responsavel_id]);
  assert.equal((await client.query('SELECT criado_por FROM contatos WHERE id = $1', [contato.id])).rows[0].criado_por, dados.criado_por);
});

testWithDatabase('[PB-057] Site e Instagram exigem inbound em inclusões e alterações', async (client) => {
  const dados = await fixture(client);
  const contato = await inserir(client, dados);
  for (const codigo of ['site', 'instagram']) {
    const origem = (await client.query('SELECT id FROM origens WHERE codigo = $1', [codigo])).rows[0].id;
    await rejeita(client, () => inserir(client, dados, { origem_id: origem, email: null, telefone: '86999999999' }), '23514', 'contatos_origem_classificacao_compativel');
    await rejeita(client, () => client.query('UPDATE contatos SET origem_id = $1 WHERE id = $2', [origem, contato.id]), '23514', 'contatos_origem_classificacao_compativel');
    const inbound = await inserir(client, dados, { origem_id: origem, classificacao: 'inbound', email: null, telefone: '86999999999' });
    await rejeita(client, () => client.query("UPDATE contatos SET classificacao = 'outbound' WHERE id = $1", [inbound.id]), '23514', 'contatos_origem_classificacao_compativel');
  }
  const inboundManual = await inserir(client, dados, { email: 'inbound@luz.example', classificacao: 'inbound' });
  assert.equal(inboundManual.classificacao, 'inbound');
});

testWithDatabase('[PB-057] atualiza timestamp e permite escrita condicionada pela versão', async (client) => {
  const dados = await fixture(client);
  const contato = await inserir(client, dados, { atualizado_em: '2000-01-01T00:00:00Z' });
  const atualizado = await client.query(
    `UPDATE contatos SET nome = 'Novo nome', versao = versao + 1
     WHERE id = $1 AND versao = $2 RETURNING *`, [contato.id, contato.versao],
  );
  assert.equal(atualizado.rows[0].versao, 2);
  assert.ok(atualizado.rows[0].atualizado_em > contato.atualizado_em);
  const stale = await client.query('UPDATE contatos SET nome = $1, versao = versao + 1 WHERE id = $2 AND versao = $3', ['Versão antiga', contato.id, contato.versao]);
  assert.equal(stale.rowCount, 0);
});

testWithDatabase('[PB-057] índices cobrem consultas e FKs do cadastro', async (client) => {
  const indices = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'contatos'");
  const nomes = new Set(indices.rows.map((row) => row.indexname));
  for (const nome of ['contatos_email_unico', 'contatos_documento_unico', 'contatos_responsavel_data_cadastro_idx', 'contatos_origem_classificacao_idx', 'contatos_etapa_captacao_idx', 'contatos_criado_por_idx']) {
    assert.ok(nomes.has(nome), nome);
  }
});
