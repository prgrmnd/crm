const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');
const { ORIGINS, STAGES, LOSS_STAGES, LOSS_REASONS } = require('../src/lib/domain.cjs');

// PB-055: origens, etapas_captacao, etapas_perda e motivos_perda com carga oficial.
const MIGRATION = '20261023110000_create_tabelas_dominio_funis';

async function expectRejection(client, sql, params, code, message) {
  await client.query('SAVEPOINT expected_failure');
  try {
    await assert.rejects(client.query(sql, params), (error) => error.code === code, message);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    await client.query('RELEASE SAVEPOINT expected_failure');
  }
}

testWithDatabase('[PB-055] migration de domínio está aplicada', async (client) => {
  const applied = await client.query(
    `SELECT migration_name FROM "_prisma_migrations"
     WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    [MIGRATION],
  );
  assert.equal(applied.rowCount, 1);
});

testWithDatabase('[PB-055] carga das 6 origens com inbound fixo só para Site e Instagram', async (client) => {
  const { rows } = await client.query(
    'SELECT codigo, nome, classificacao_fixa, ativo FROM origens ORDER BY codigo',
  );
  assert.deepEqual(rows, [
    { codigo: 'email', nome: 'E-mail', classificacao_fixa: null, ativo: true },
    { codigo: 'evento', nome: 'Evento', classificacao_fixa: null, ativo: true },
    { codigo: 'indicacao', nome: 'Indicação', classificacao_fixa: null, ativo: true },
    { codigo: 'instagram', nome: 'Instagram', classificacao_fixa: 'inbound', ativo: true },
    { codigo: 'site', nome: 'Site', classificacao_fixa: 'inbound', ativo: true },
    { codigo: 'whatsapp', nome: 'WhatsApp', classificacao_fixa: null, ativo: true },
  ]);
  assert.deepEqual(
    rows.map((row) => row.nome).sort(),
    [...ORIGINS].sort(),
    'rótulos devem ser os mesmos do protótipo',
  );
});

testWithDatabase('[PB-055] carga das 4 etapas de captação em ordem', async (client) => {
  const { rows } = await client.query('SELECT codigo, nome, ordem FROM etapas_captacao ORDER BY ordem');
  assert.deepEqual(rows, [
    { codigo: 'aprendizado_descoberta', nome: 'Aprendizado e descoberta', ordem: 1 },
    { codigo: 'reconhecimento_problema', nome: 'Reconhecimento do problema', ordem: 2 },
    { codigo: 'consideracao_solucao', nome: 'Consideração da solução', ordem: 3 },
    { codigo: 'decisao_doacao', nome: 'Decisão de doação', ordem: 4 },
  ]);
  assert.deepEqual(rows.map((row) => row.nome), STAGES, 'ordem e rótulos iguais ao protótipo');
});

testWithDatabase('[PB-055] carga das 5 etapas de perda com agendamento só em Retomada agendada', async (client) => {
  const { rows } = await client.query(
    'SELECT codigo, nome, ordem, exige_agendamento FROM etapas_perda ORDER BY ordem',
  );
  assert.deepEqual(rows, [
    { codigo: 'perda_registrada', nome: 'Perda registrada', ordem: 1, exige_agendamento: false },
    { codigo: 'em_analise', nome: 'Em análise', ordem: 2, exige_agendamento: false },
    { codigo: 'retomada_agendada', nome: 'Retomada agendada', ordem: 3, exige_agendamento: true },
    { codigo: 'em_reaproximacao', nome: 'Em reaproximação', ordem: 4, exige_agendamento: false },
    { codigo: 'encerrado_sem_retomada', nome: 'Encerrado sem retomada', ordem: 5, exige_agendamento: false },
  ]);
  assert.deepEqual(rows.map((row) => row.nome), LOSS_STAGES);
});

testWithDatabase('[PB-055] carga dos 5 motivos de perda com observação só em Outros', async (client) => {
  const { rows } = await client.query(
    'SELECT codigo, nome, exige_observacao FROM motivos_perda ORDER BY nome',
  );
  assert.deepEqual(
    rows.map(({ codigo, exige_observacao }) => [codigo, exige_observacao]),
    [
      ['momento_inadequado', false],
      ['outros', true],
      ['sem_disponibilidade_financeira', false],
      ['sem_interesse', false],
      ['sem_retorno', false],
    ],
  );
  assert.deepEqual(rows.map((row) => row.nome).sort(), [...LOSS_REASONS].sort());
});

testWithDatabase('[PB-055] carga é idempotente ao reexecutar os INSERTs', async (client) => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION, 'migration.sql'),
    'utf8',
  );
  const inserts = sql.match(/INSERT INTO[\s\S]*?ON CONFLICT \(codigo\) DO NOTHING;/g);
  assert.equal(inserts.length, 4, 'cada tabela deve ter carga idempotente');

  for (const insert of inserts) await client.query(insert);

  const counts = await client.query(`
    SELECT (SELECT count(*) FROM origens)::int AS origens,
           (SELECT count(*) FROM etapas_captacao)::int AS etapas_captacao,
           (SELECT count(*) FROM etapas_perda)::int AS etapas_perda,
           (SELECT count(*) FROM motivos_perda)::int AS motivos_perda`);
  assert.deepEqual(counts.rows[0], { origens: 6, etapas_captacao: 4, etapas_perda: 5, motivos_perda: 5 });
});

testWithDatabase('[PB-055] não permite etapas extras nem editar códigos ou apagar linhas', async (client) => {
  await expectRejection(
    client,
    `INSERT INTO etapas_captacao (codigo, nome, ordem) VALUES ('nova_etapa', 'Nova etapa', 5)`,
    [],
    '23514',
    'o funil de captação aceita apenas ordens 1 a 4',
  );
  await expectRejection(
    client,
    `INSERT INTO etapas_captacao (codigo, nome, ordem) VALUES ('duplicada', 'Duplicada', 2)`,
    [],
    '23505',
    'a ordem da etapa é única',
  );
  await expectRejection(
    client,
    `INSERT INTO etapas_perda (codigo, nome, ordem) VALUES ('nova_perda', 'Nova perda', 6)`,
    [],
    '23514',
    'o funil de perdas aceita apenas ordens 1 a 5',
  );
  await expectRejection(
    client,
    `UPDATE etapas_captacao SET codigo = 'renomeada' WHERE ordem = 1`,
    [],
    '55000',
    'códigos de etapa são estáveis',
  );
  await expectRejection(
    client,
    `DELETE FROM motivos_perda WHERE codigo = 'outros'`,
    [],
    '55000',
    'motivos homologados não são apagados',
  );
  await expectRejection(
    client,
    `DELETE FROM origens WHERE codigo = 'site'`,
    [],
    '55000',
    'origens preservam referências históricas',
  );
  await expectRejection(
    client,
    `INSERT INTO origens (codigo, nome, classificacao_fixa) VALUES ('tiktok', 'TikTok', 'outbound')`,
    [],
    '23514',
    'classificação fixa só aceita inbound',
  );

  await client.query(`UPDATE origens SET ativo = FALSE WHERE codigo = 'evento'`);
  const inativa = await client.query(`SELECT ativo FROM origens WHERE codigo = 'evento'`);
  assert.equal(inativa.rows[0].ativo, false, 'origem pode ser inativada sem perder a referência');
});
