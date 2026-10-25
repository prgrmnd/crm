const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

async function fixture(client) {
  const { rows: [user] } = await client.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil)
    VALUES ('Operador', $1, $2, 'operador_captacao') RETURNING id`,
    [`${randomUUID()}@luz.example`, '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0']);
  const { rows: [contact] } = await client.query(`INSERT INTO contatos
    (tipo_pessoa,nome,email,origem_id,classificacao,etapa_captacao_id,responsavel_id,data_cadastro,criado_por)
    VALUES ('PF','Contato',$1,(SELECT id FROM origens WHERE codigo='whatsapp'),'outbound',
    (SELECT id FROM etapas_captacao WHERE ordem=1),$2,CURRENT_TIMESTAMP,$2) RETURNING id`,
    [`${randomUUID()}@luz.example`, user.id]);
  return { contact: contact.id, user: user.id };
}
async function interaction(client, f, overrides = {}) {
  const data = { contato_id: f.contact, autor_id: f.user, canal: 'telefone', ocorrido_em: '2020-01-01T12:00:00Z', resumo: 'Conversa registrada', ...overrides };
  const { rows: [row] } = await client.query(`INSERT INTO interacoes (${Object.keys(data).join(',')})
    VALUES (${Object.keys(data).map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(data));
  return row;
}
async function response(client, f, classification = 'descadastro') {
  const { rows: [row] } = await client.query(`INSERT INTO respostas_contato(contato_id,autor_id,classificacao,conteudo)
    VALUES ($1,$2,$3,'Resposta registrada') RETURNING *`, [f.contact, f.user, classification]);
  return row;
}
async function rejects(client, fn, code) {
  await client.query('SAVEPOINT invalid_history');
  try {
    await assert.rejects(fn, error => { assert.equal(error.code, code); return true; });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_history');
    await client.query('RELEASE SAVEPOINT invalid_history');
  }
}

testWithDatabase('[PB-058] migration, relações e preferência inicial de novos contatos', async client => {
  const migration = await client.query(`SELECT 1 FROM _prisma_migrations
    WHERE migration_name='20261024130000_create_historico_opt_out' AND finished_at IS NOT NULL`);
  assert.equal(migration.rowCount, 1);
  const f = await fixture(client);
  const row = await interaction(client, f);
  assert.equal(row.contato_id, f.contact);
  assert.equal(row.autor_id, f.user);
  assert.ok(row.criado_em instanceof Date);
  const { rows: [pref] } = await client.query('SELECT * FROM preferencias_comunicacao WHERE contato_id=$1', [f.contact]);
  assert.equal(pref.situacao, 'permitido');
  assert.equal(pref.canal, 'email');
  assert.equal(pref.autor_id, null);
  assert.equal(pref.vigente_ate, null);
});

testWithDatabase('[PB-058] canais, conteúdo, datas e FKs de interações', async client => {
  const f = await fixture(client);
  for (const canal of ['telefone','whatsapp','reuniao','email']) await interaction(client, f, { canal });
  for (const change of [{ canal: 'sms' }, { resumo: '' }, { resumo: '  ' }, { ocorrido_em: '2999-01-01Z' }]) {
    await rejects(client, () => interaction(client, f, change), '23514');
  }
  await interaction(client, f, { resumo: 'a'.repeat(3000) });
  await rejects(client, () => interaction(client, f, { resumo: 'a'.repeat(3001) }), '22001');
  for (const field of ['contato_id', 'autor_id']) {
    await rejects(client, () => interaction(client, f, { [field]: randomUUID() }), '23503');
    await rejects(client, () => interaction(client, f, { [field]: null }), '23502');
  }
});

testWithDatabase('[PB-058] anotações e respostas bloqueiam UPDATE DELETE e TRUNCATE', async client => {
  const f = await fixture(client);
  await interaction(client, f);
  await response(client, f, 'positiva');
  for (const table of ['interacoes','respostas_contato']) {
    for (const sql of [`UPDATE ${table} SET autor_id=autor_id`, `DELETE FROM ${table}`, `TRUNCATE ${table} CASCADE`]) {
      await rejects(client, () => client.query(sql), '55000');
    }
  }
});

testWithDatabase('[PB-058] respostas positivas/negativas não alteram preferência', async client => {
  const f = await fixture(client);
  for (const value of ['positiva','negativa']) await response(client, f, value);
  await rejects(client, () => response(client, f, 'invalida'), '23514');
  const { rows } = await client.query('SELECT situacao FROM preferencias_comunicacao WHERE contato_id=$1', [f.contact]);
  assert.deepEqual(rows, [{ situacao: 'permitido' }]);
  await rejects(client, () => client.query(`INSERT INTO respostas_contato(contato_id,autor_id,classificacao,conteudo)
    VALUES ($1,$2,'positiva',' ')`, [f.contact,f.user]), '23514');
  await rejects(client, () => client.query(`INSERT INTO respostas_contato(contato_id,autor_id,classificacao,conteudo)
    VALUES ($1,$2,'positiva',$3)`, [f.contact,f.user,'x'.repeat(3001)]), '22001');
});

testWithDatabase('[PB-058] descadastro encerra vigência e audita atomicamente, inclusive repetição', async client => {
  const f = await fixture(client);
  for (let i=0; i<2; i++) {
    const r = await response(client, f);
    const { rows: [pref] } = await client.query(`SELECT * FROM preferencias_comunicacao
      WHERE contato_id=$1 AND vigente_ate IS NULL`, [f.contact]);
    assert.equal(pref.situacao, 'descadastrado');
    assert.equal(pref.resposta_id, r.id);
    assert.equal(pref.autor_id, f.user);
    const { rows: [audit] } = await client.query('SELECT * FROM eventos_auditoria WHERE correlacao_id=$1', [r.id]);
    assert.equal(audit.ator_id, f.user);
    assert.equal(audit.contato_id, f.contact);
    assert.equal(audit.entidade_id, pref.id);
    assert.equal(audit.acao, 'comunicacao.descadastro');
    assert.equal(audit.depois.situacao, 'descadastrado');
  }
  const { rows } = await client.query(`SELECT a.vigente_ate=b.vigente_desde AS adjacente
    FROM preferencias_comunicacao a JOIN preferencias_comunicacao b
    ON a.contato_id=b.contato_id AND a.vigente_ate=b.vigente_desde WHERE a.contato_id=$1`, [f.contact]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.adjacente));
});

testWithDatabase('[PB-058] falha na auditoria desfaz resposta e mudança de preferência', async client => {
  const f = await fixture(client);
  await client.query(`CREATE FUNCTION pg_temp.rejeitar_auditoria_pb058() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Falha simulada' USING ERRCODE='P0001'; END; $$`);
  await client.query(`CREATE TRIGGER teste_pb058_auditoria BEFORE INSERT ON eventos_auditoria
    FOR EACH ROW EXECUTE FUNCTION pg_temp.rejeitar_auditoria_pb058()`);
  await rejects(client, () => response(client, f), 'P0001');
  assert.equal((await client.query('SELECT 1 FROM respostas_contato WHERE contato_id=$1',[f.contact])).rowCount, 0);
  const { rows } = await client.query('SELECT situacao,vigente_ate FROM preferencias_comunicacao WHERE contato_id=$1',[f.contact]);
  assert.deepEqual(rows, [{ situacao:'permitido', vigente_ate:null }]);
});

testWithDatabase('[PB-058] períodos adjacentes permitidos, sobreposição e intervalo vazio proibidos', async client => {
  const f = await fixture(client);
  const insert = (from, to, canal='email', situacao='permitido') => client.query(`INSERT INTO preferencias_comunicacao
    (contato_id,canal,situacao,vigente_desde,vigente_ate) VALUES ($1,$2,$3,$4,$5)`,[f.contact,canal,situacao,from,to]);
  await insert('2020-01-01Z','2020-02-01Z');
  await insert('2020-02-01Z','2020-03-01Z');
  await rejects(client, () => insert('2020-01-15Z','2020-02-15Z'), '23P01');
  await rejects(client, () => insert('2020-01-01Z','2020-01-01Z'), '23514');
  await rejects(client, () => insert('2020-02-01Z','2020-01-01Z'), '23514');
  await rejects(client, () => insert('2021-01-01Z','2021-02-01Z','sms'), '23514');
  await rejects(client, () => insert('2021-01-01Z','2021-02-01Z','email','invalida'), '23514');
  // Tanto o índice único parcial quanto a exclusão impedem duas preferências sem fim.
  await client.query('SAVEPOINT duplicate_current');
  await assert.rejects(() => insert('2030-01-01Z',null), error => ['23505','23P01'].includes(error.code));
  await client.query('ROLLBACK TO SAVEPOINT duplicate_current');
});

testWithDatabase('[PB-058] histórico de preferências só aceita encerramento e não permite exclusão', async client => {
  const f = await fixture(client);
  await rejects(client, () => client.query(`UPDATE preferencias_comunicacao SET situacao='descadastrado' WHERE contato_id=$1`,[f.contact]), '55000');
  await response(client, f);
  await rejects(client, () => client.query(`UPDATE preferencias_comunicacao SET vigente_ate=vigente_ate + interval '1 day'
    WHERE contato_id=$1 AND vigente_ate IS NOT NULL`,[f.contact]), '55000');
  await rejects(client, () => client.query('DELETE FROM preferencias_comunicacao WHERE contato_id=$1',[f.contact]), '55000');
  await rejects(client, () => client.query('TRUNCATE preferencias_comunicacao CASCADE'), '55000');
});

testWithDatabase('[PB-058] upgrade preserva contatos existentes e inicializa preferências', async client => {
  const fs = require('node:fs');
  const path = require('node:path');
  // Esquema isolado e transacional: reproduz upgrade sem alterar o banco compartilhado da suíte.
  const schema = 'upgrade_pb058_' + randomUUID().replaceAll('-', '');
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}, public`);
  const root = path.join(__dirname, '..', 'prisma', 'migrations');
  const migrations = fs.readdirSync(root).filter(name => fs.statSync(path.join(root, name)).isDirectory()).sort();
  for (const name of migrations.filter(name => name < '20261024130000_create_historico_opt_out')) {
    await client.query(fs.readFileSync(path.join(root, name, 'migration.sql'), 'utf8'));
  }
  const f = await fixture(client);
  await client.query('UPDATE contatos SET excluido_em=CURRENT_TIMESTAMP WHERE id=$1', [f.contact]);
  await client.query(fs.readFileSync(path.join(root, '20261024130000_create_historico_opt_out', 'migration.sql'), 'utf8'));
  const { rows: [row] } = await client.query(`SELECT p.situacao,p.autor_id,p.vigente_ate,
    p.vigente_desde=c.criado_em AS inicio_correto FROM preferencias_comunicacao p
    JOIN contatos c ON c.id=p.contato_id WHERE c.id=$1`,[f.contact]);
  assert.deepEqual(row, { situacao:'permitido', autor_id:null, vigente_ate:null, inicio_correto:true });
  await response(client, f);
  assert.equal((await client.query('SELECT 1 FROM eventos_auditoria WHERE contato_id=$1',[f.contact])).rowCount, 1);
});

testWithDatabase('[PB-058] descadastros concorrentes preservam uma vigência atual sem deadlock de FK', async client => {
  const { Client } = require('pg');
  const fs = require('node:fs');
  const path = require('node:path');
  // O cenário precisa de duas transações: usa apenas dados em um esquema descartável exclusivo.
  const schema = 'concurrency_pb058_' + randomUUID().replaceAll('-', '');
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}, public`);
  const root = path.join(__dirname, '..', 'prisma', 'migrations');
  for (const name of fs.readdirSync(root).filter(name => fs.statSync(path.join(root, name)).isDirectory()).sort()) {
    await client.query(fs.readFileSync(path.join(root, name, 'migration.sql'), 'utf8'));
  }
  const f = await fixture(client);
  const connections = [0,1].map(() => new Client({ connectionString: process.env.DATABASE_URL_TEST }));
  await client.query('COMMIT');
  try {
    for (const connection of connections) {
      await connection.connect();
      await connection.query(`SET search_path TO ${schema}, public`);
      await connection.query('BEGIN');
      await connection.query("SET LOCAL lock_timeout='5s'");
      // Reproduz os locks compartilhados das FKs antes de aplicar os dois descadastros.
      await connection.query('SELECT id FROM contatos WHERE id=$1 FOR KEY SHARE', [f.contact]);
    }
    const results = await Promise.allSettled(connections.map(async connection => {
      try {
        await response(connection, f);
        await connection.query('COMMIT');
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      }
    }));
    for (const result of results) assert.equal(result.status, 'fulfilled', result.reason?.message);
    const { rows } = await client.query(`SELECT situacao FROM ${schema}.preferencias_comunicacao
      WHERE contato_id=$1 AND vigente_ate IS NULL`, [f.contact]);
    assert.deepEqual(rows, [{ situacao:'descadastrado' }]);
    assert.equal((await client.query(`SELECT 1 FROM ${schema}.preferencias_comunicacao WHERE contato_id=$1`,[f.contact])).rowCount, 3);
    assert.equal((await client.query(`SELECT 1 FROM ${schema}.eventos_auditoria WHERE contato_id=$1`,[f.contact])).rowCount, 2);
  } finally {
    await Promise.allSettled(connections.map(connection => connection.end()));
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
  }
});
