const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

const SENHA_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0';

async function fixture(client) {
  const {
    rows: [usuario],
  } = await client.query(
    `INSERT INTO usuarios(nome, email, senha_hash, perfil)
     VALUES ('Operador de planos', $1, $2, 'operador_captacao') RETURNING id`,
    [`${randomUUID()}@luz.example`, SENHA_HASH],
  );
  const {
    rows: [contato],
  } = await client.query(
    `INSERT INTO contatos
      (tipo_pessoa, nome, email, origem_id, classificacao, etapa_captacao_id,
       responsavel_id, data_cadastro, criado_por)
     VALUES ('PF', 'Doador de teste', $1,
       (SELECT id FROM origens WHERE codigo = 'whatsapp'), 'outbound',
       (SELECT id FROM etapas_captacao WHERE ordem = 1), $2, CURRENT_TIMESTAMP, $2)
     RETURNING id`,
    [`${randomUUID()}@luz.example`, usuario.id],
  );
  return { contato: contato.id, usuario: usuario.id };
}

async function inserir(client, tabela, dados) {
  const colunas = Object.keys(dados);
  const { rows } = await client.query(
    `INSERT INTO ${tabela} (${colunas.join(', ')})
     VALUES (${colunas.map((_, indice) => `$${indice + 1}`).join(', ')}) RETURNING *`,
    Object.values(dados),
  );
  return rows[0];
}

function plano(contatoId, overrides = {}) {
  return {
    contato_id: contatoId,
    modalidade: 'Recorrente',
    valor_pactuado: '1234.56',
    dia_vencimento: 10,
    data_adesao: '2020-01-01T12:00:00Z',
    ...overrides,
  };
}

function suspensao(planoAdesaoId, overrides = {}) {
  return {
    plano_adesao_id: planoAdesaoId,
    inicio_em: '2020-02-01T00:00:00Z',
    fim_em: '2020-03-01T00:00:00Z',
    ...overrides,
  };
}

async function rejeita(client, operacao, codigo, constraint) {
  await client.query('SAVEPOINT invalid_plano');
  try {
    await assert.rejects(operacao, (error) => {
      assert.equal(error.code, codigo);
      if (constraint) assert.equal(error.constraint, constraint);
      return true;
    });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_plano');
    await client.query('RELEASE SAVEPOINT invalid_plano');
  }
}

testWithDatabase('[PB-060] migration cria adesão com valor pactuado e datas do padrão', async (client) => {
  const migration = await client.query(
    `SELECT 1 FROM _prisma_migrations
     WHERE migration_name = '20261127100000_create_planos_adesao_suspensoes'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  assert.equal(migration.rowCount, 1);

  const f = await fixture(client);
  const recorrente = await inserir(client, 'planos_adesao', plano(f.contato));
  assert.match(recorrente.id, /^[0-9a-f-]{36}$/i);
  assert.equal(recorrente.contato_id, f.contato);
  assert.equal(recorrente.modalidade, 'Recorrente');
  assert.equal(recorrente.valor_pactuado, '1234.56');
  assert.equal(recorrente.dia_vencimento, 10);
  assert.ok(recorrente.criado_em instanceof Date);
  assert.ok(recorrente.atualizado_em instanceof Date);
  assert.equal(recorrente.data_adesao.toISOString(), '2020-01-01T12:00:00.000Z');

  const pontual = await inserir(
    client,
    'planos_adesao',
    plano(f.contato, { modalidade: 'Pontual', valor_pactuado: '50.00', dia_vencimento: null }),
  );
  assert.equal(pontual.modalidade, 'Pontual');
  assert.equal(pontual.dia_vencimento, null);
});

testWithDatabase('[PB-060] valor monetário usa NUMERIC(14,2) e exige valor positivo', async (client) => {
  const f = await fixture(client);
  const limite = await inserir(client, 'planos_adesao', plano(f.contato, { valor_pactuado: '123456789012.34' }));
  assert.equal(limite.valor_pactuado, '123456789012.34');
  const arredondado = await inserir(client, 'planos_adesao', plano(f.contato, { valor_pactuado: '10.239' }));
  assert.equal(arredondado.valor_pactuado, '10.24');

  for (const valor of ['1234567890123.45', '0', '-1']) {
    await rejeita(
      client,
      () => inserir(client, 'planos_adesao', plano(f.contato, { valor_pactuado: valor })),
      valor === '0' || valor === '-1' ? '23514' : '22003',
    );
  }
});

testWithDatabase('[PB-060] modalidade, vencimento 1-28 e FK do contato são validados', async (client) => {
  const f = await fixture(client);
  for (const alteracao of [
    { modalidade: 'Pontual', dia_vencimento: 10 },
    { modalidade: 'Recorrente', dia_vencimento: null },
    { modalidade: 'Recorrente', dia_vencimento: 0 },
    { modalidade: 'Recorrente', dia_vencimento: 29 },
    { modalidade: 'Unica' },
  ]) {
    await rejeita(client, () => inserir(client, 'planos_adesao', plano(f.contato, alteracao)), '23514');
  }
  for (const [campo, valor, codigo] of [
    ['contato_id', randomUUID(), '23503'],
    ['contato_id', null, '23502'],
    ['valor_pactuado', null, '23502'],
    ['data_adesao', null, '23502'],
  ]) {
    await rejeita(client, () => inserir(client, 'planos_adesao', plano(f.contato, { [campo]: valor })), codigo);
  }
});

testWithDatabase('[PB-060] suspensão válida exige adesão existente', async (client) => {
  const f = await fixture(client);
  const adesao = await inserir(client, 'planos_adesao', plano(f.contato));
  const registro = await inserir(client, 'suspensoes_plano', suspensao(adesao.id));
  assert.match(registro.id, /^[0-9a-f-]{36}$/i);
  assert.equal(registro.plano_adesao_id, adesao.id);
  assert.equal(registro.inicio_em.toISOString(), '2020-02-01T00:00:00.000Z');
  assert.equal(registro.fim_em.toISOString(), '2020-03-01T00:00:00.000Z');
  assert.ok(registro.criado_em instanceof Date);

  await rejeita(
    client,
    () => inserir(client, 'suspensoes_plano', suspensao(randomUUID())),
    '23503',
    'suspensoes_plano_plano_adesao_id_fkey',
  );
  await rejeita(
    client,
    () => inserir(client, 'suspensoes_plano', suspensao(null)),
    '23502',
  );
});

testWithDatabase('[PB-060] períodos adjacentes são permitidos e sobrepostos são bloqueados', async (client) => {
  const f = await fixture(client);
  const adesao = await inserir(client, 'planos_adesao', plano(f.contato));
  await inserir(client, 'suspensoes_plano', suspensao(adesao.id, { inicio_em: '2020-01-01Z', fim_em: '2020-02-01Z' }));
  await inserir(client, 'suspensoes_plano', suspensao(adesao.id, { inicio_em: '2020-02-01Z', fim_em: '2020-03-01Z' }));

  await rejeita(
    client,
    () => inserir(client, 'suspensoes_plano', suspensao(adesao.id, { inicio_em: '2020-01-15Z', fim_em: '2020-02-15Z' })),
    '23P01',
    'suspensoes_plano_sem_sobreposicao',
  );
  await rejeita(
    client,
    () => inserir(client, 'suspensoes_plano', suspensao(adesao.id, { inicio_em: '2020-01-15Z', fim_em: null })),
    '23P01',
    'suspensoes_plano_sem_sobreposicao',
  );
});

testWithDatabase('[PB-060] o mesmo intervalo é permitido em adesões diferentes', async (client) => {
  const f = await fixture(client);
  const primeira = await inserir(client, 'planos_adesao', plano(f.contato));
  const segunda = await inserir(client, 'planos_adesao', plano(f.contato, { valor_pactuado: '99.99' }));
  const periodo = { inicio_em: '2020-02-01Z', fim_em: '2020-03-01Z' };
  await inserir(client, 'suspensoes_plano', suspensao(primeira.id, periodo));
  await inserir(client, 'suspensoes_plano', suspensao(segunda.id, periodo));
  const { rows } = await client.query('SELECT plano_adesao_id FROM suspensoes_plano');
  assert.equal(rows.length, 2);
});

testWithDatabase('[PB-060] fim igual ou anterior ao início é rejeitado', async (client) => {
  const f = await fixture(client);
  const adesao = await inserir(client, 'planos_adesao', plano(f.contato));
  for (const [inicio_em, fim_em] of [
    ['2020-02-01Z', '2020-01-01Z'],
    ['2020-02-01Z', '2020-02-01Z'],
  ]) {
    await rejeita(
      client,
      () => inserir(client, 'suspensoes_plano', suspensao(adesao.id, { inicio_em, fim_em })),
      '23514',
      'suspensoes_plano_periodo_valido',
    );
  }
});

testWithDatabase('[PB-060] constraint de exclusão temporal existe no banco após as migrations', async (client) => {
  const { rows } = await client.query(
    `SELECT conname, contype, pg_get_constraintdef(oid) AS definicao
     FROM pg_constraint
     WHERE conrelid = 'suspensoes_plano'::regclass AND conname = 'suspensoes_plano_sem_sobreposicao'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].contype, 'x');
  assert.match(rows[0].definicao, /EXCLUDE USING gist/);
  assert.match(rows[0].definicao, /tstzrange\(inicio_em, fim_em/);
});
