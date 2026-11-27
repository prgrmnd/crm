const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

const SENHA_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0';

async function fixture(client) {
  const {
    rows: [usuario],
  } = await client.query(
    `INSERT INTO usuarios(nome, email, senha_hash, perfil)
     VALUES ('Operador do outbox', $1, $2, 'operador_captacao') RETURNING id`,
    [`${randomUUID()}@luz.example`, SENHA_HASH],
  );
  const {
    rows: [contato],
  } = await client.query(
    `INSERT INTO contatos
      (tipo_pessoa, nome, email, origem_id, classificacao, etapa_captacao_id,
       responsavel_id, data_cadastro, criado_por)
     VALUES ('PF', 'Contato do outbox', $1,
       (SELECT id FROM origens WHERE codigo = 'whatsapp'), 'outbound',
       (SELECT id FROM etapas_captacao WHERE ordem = 1), $2, CURRENT_TIMESTAMP, $2)
     RETURNING id`,
    [`${randomUUID()}@luz.example`, usuario.id],
  );
  return { contato: contato.id, usuario: usuario.id };
}

function evento(overrides = {}) {
  const agregado = overrides.agregado_id ?? randomUUID();
  return {
    tipo: 'captacao.etapa_alterada',
    agregado_tipo: 'contato',
    agregado_id: agregado,
    ator_tipo: 'sistema',
    payload: JSON.stringify({
      etapaAnterior: 'aprendizado_descoberta',
      etapaNova: 'reconhecimento_problema',
    }),
    correlacao_id: randomUUID(),
    ...overrides,
  };
}

async function registrar(client, dados) {
  const colunas = Object.keys(dados);
  const { rows } = await client.query(
    `INSERT INTO eventos_dominio (${colunas.join(', ')})
     VALUES (${colunas.map((_, indice) => `$${indice + 1}`).join(', ')}) RETURNING *`,
    Object.values(dados),
  );
  return rows[0];
}

async function mensagemDo(client, eventoId) {
  const { rows } = await client.query('SELECT * FROM caixa_saida WHERE evento_id = $1', [eventoId]);
  return rows;
}

async function rejeita(client, operacao, codigo, constraint) {
  await client.query('SAVEPOINT invalid_outbox');
  try {
    await assert.rejects(operacao, (error) => {
      assert.equal(error.code, codigo);
      if (constraint) assert.equal(error.constraint, constraint);
      return true;
    });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_outbox');
    await client.query('RELEASE SAVEPOINT invalid_outbox');
  }
}

testWithDatabase('[PB-068] migration cria eventos de domínio com mensagem pendente automática', async (client) => {
  const migration = await client.query(
    `SELECT 1 FROM _prisma_migrations
     WHERE migration_name = '20261127120000_create_outbox_eventos_dominio'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  assert.equal(migration.rowCount, 1);

  const f = await fixture(client);
  const registrado = await registrar(
    client,
    evento({
      agregado_id: f.contato,
      contato_id: f.contato,
      ator_tipo: 'usuario',
      ator_id: f.usuario,
    }),
  );
  assert.match(registrado.id, /^[0-9a-f-]{36}$/i);
  assert.equal(registrado.versao_esquema, 1);
  assert.equal(registrado.payload.etapaNova, 'reconhecimento_problema');
  assert.ok(registrado.criado_em instanceof Date);

  const mensagens = await mensagemDo(client, registrado.id);
  assert.equal(mensagens.length, 1);
  const [mensagem] = mensagens;
  assert.equal(mensagem.topico, 'captacao.etapa_alterada');
  assert.equal(mensagem.situacao, 'pendente');
  assert.equal(mensagem.tentativas, 0);
  assert.equal(mensagem.publicado_em, null);
  assert.equal(mensagem.bloqueado_ate, null);
  assert.equal(mensagem.disponivel_em.getTime(), registrado.criado_em.getTime());
});

testWithDatabase('[PB-068] evento e mensagem são desfeitos junto com a regra de negócio', async (client) => {
  const f = await fixture(client);
  await client.query('SAVEPOINT regra_negocio');
  await client.query(
    `UPDATE contatos SET etapa_captacao_id = (SELECT id FROM etapas_captacao WHERE ordem = 2),
       versao = versao + 1 WHERE id = $1`,
    [f.contato],
  );
  const registrado = await registrar(client, evento({ agregado_id: f.contato, contato_id: f.contato }));
  assert.equal((await mensagemDo(client, registrado.id)).length, 1);
  await client.query('ROLLBACK TO SAVEPOINT regra_negocio');

  const eventos = await client.query('SELECT 1 FROM eventos_dominio WHERE id = $1', [registrado.id]);
  assert.equal(eventos.rowCount, 0);
  assert.equal((await mensagemDo(client, registrado.id)).length, 0);
  const {
    rows: [contato],
  } = await client.query(
    `SELECT e.ordem, c.versao FROM contatos c JOIN etapas_captacao e ON e.id = c.etapa_captacao_id
     WHERE c.id = $1`,
    [f.contato],
  );
  assert.deepEqual(contato, { ordem: 1, versao: 1 });
});

testWithDatabase('[PB-068] evento inválido não deixa regra de negócio nem mensagem parciais', async (client) => {
  const f = await fixture(client);
  await rejeita(
    client,
    async () => {
      await client.query('UPDATE contatos SET versao = versao + 1 WHERE id = $1', [f.contato]);
      await registrar(
        client,
        evento({
          contato_id: f.contato,
          payload: JSON.stringify({ token: 'segredo' }),
        }),
      );
    },
    '23514',
    'eventos_dominio_payload_sanitizado',
  );
  const { rows } = await client.query('SELECT versao FROM contatos WHERE id = $1', [f.contato]);
  assert.equal(rows[0].versao, 1);
  const mensagens = await client.query(
    'SELECT 1 FROM caixa_saida c JOIN eventos_dominio e ON e.id = c.evento_id WHERE e.contato_id = $1',
    [f.contato],
  );
  assert.equal(mensagens.rowCount, 0);
});

testWithDatabase('[PB-068] chave de deduplicação impede evento duplicado', async (client) => {
  const chave = `captacao.etapa_alterada:${randomUUID()}:1`;
  const primeiro = await registrar(client, evento({ chave_deduplicacao: chave }));
  await rejeita(
    client,
    () => registrar(client, evento({ chave_deduplicacao: chave })),
    '23505',
    'eventos_dominio_chave_deduplicacao_unica',
  );
  const { rows } = await client.query('SELECT count(*)::int AS total FROM caixa_saida WHERE evento_id = $1', [
    primeiro.id,
  ]);
  assert.equal(rows[0].total, 1);

  // Sem chave natural, eventos distintos continuam permitidos.
  await registrar(client, evento());
  await registrar(client, evento());
});

testWithDatabase('[PB-068] cliques concorrentes com a mesma chave publicam um único evento', async (client) => {
  const chave = `captacao.etapa_alterada:${randomUUID()}:1`;
  const sessaoA = new Client({
    connectionString: process.env.DATABASE_URL_TEST,
  });
  const sessaoB = new Client({
    connectionString: process.env.DATABASE_URL_TEST,
  });
  await sessaoA.connect();
  await sessaoB.connect();
  try {
    await sessaoA.query('BEGIN');
    await sessaoB.query('BEGIN');
    await registrar(sessaoA, evento({ chave_deduplicacao: chave }));

    // B aguarda o desfecho de A no índice único em vez de gravar um segundo evento.
    let bConcluiu = false;
    const tentativaB = registrar(sessaoB, evento({ chave_deduplicacao: chave })).finally(() => {
      bConcluiu = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(bConcluiu, false, 'a segunda gravação deve aguardar a primeira transação');

    // Se A desistir (rollback), B prossegue; se A confirmar, B recebe 23505.
    await sessaoA.query('ROLLBACK');
    const registradoB = await tentativaB;
    assert.equal((await mensagemDo(sessaoB, registradoB.id)).length, 1);
    const { rows } = await sessaoB.query(
      'SELECT count(*)::int AS total FROM eventos_dominio WHERE chave_deduplicacao = $1',
      [chave],
    );
    assert.equal(rows[0].total, 1);
  } finally {
    await sessaoA.query('ROLLBACK').catch(() => {});
    await sessaoB.query('ROLLBACK').catch(() => {});
    await sessaoA.end();
    await sessaoB.end();
  }
});

testWithDatabase('[PB-068] validações de tipo, ator e payload', async (client) => {
  const f = await fixture(client);
  const casos = [
    [{ tipo: 'EtapaAlterada' }, '23514', 'eventos_dominio_tipo_formato'],
    [{ tipo: 'captacao' }, '23514', 'eventos_dominio_tipo_formato'],
    [{ versao_esquema: 0 }, '23514', 'eventos_dominio_versao_esquema_valida'],
    [{ agregado_tipo: '  ' }, '23514', 'eventos_dominio_agregado_nao_vazio'],
    [{ ator_tipo: 'robo' }, '23514', undefined],
    [{ ator_tipo: 'usuario' }, '23514', 'eventos_dominio_ator_id_compativel'],
    [{ ator_tipo: 'sistema', ator_id: f.usuario }, '23514', 'eventos_dominio_ator_id_compativel'],
    [{ payload: JSON.stringify([1, 2]) }, '23514', 'eventos_dominio_payload_objeto'],
    [{ payload: JSON.stringify({ dados: { senhaHash: 'x' } }) }, '23514', 'eventos_dominio_payload_sanitizado'],
    [{ chave_deduplicacao: ' ' }, '23514', 'eventos_dominio_chave_deduplicacao_nao_vazia'],
    [{ contato_id: randomUUID() }, '23503', 'eventos_dominio_contato_id_fkey'],
    [{ ator_tipo: 'usuario', ator_id: randomUUID() }, '23503', 'eventos_dominio_ator_id_fkey'],
  ];
  for (const [overrides, codigo, constraint] of casos) {
    await rejeita(client, () => registrar(client, evento(overrides)), codigo, constraint);
  }
});

testWithDatabase('[PB-068] eventos de domínio são imutáveis', async (client) => {
  const registrado = await registrar(client, evento());
  await rejeita(
    client,
    () => client.query(`UPDATE eventos_dominio SET tipo = 'captacao.outro' WHERE id = $1`, [registrado.id]),
    '55000',
  );
  await rejeita(client, () => client.query('DELETE FROM eventos_dominio WHERE id = $1', [registrado.id]), '55000');
  await rejeita(client, () => client.query('TRUNCATE eventos_dominio CASCADE'), '55000');
});

testWithDatabase('[PB-068] caixa de saída só é preenchida pelo evento', async (client) => {
  const registrado = await registrar(client, evento());
  await rejeita(
    client,
    () =>
      client.query(`INSERT INTO caixa_saida (evento_id, topico) VALUES ($1, 'captacao.etapa_alterada')`, [
        registrado.id,
      ]),
    '55000',
  );
  await rejeita(
    client,
    () =>
      client.query(`INSERT INTO caixa_saida (evento_id, topico) VALUES ($1, 'captacao.etapa_alterada')`, [
        randomUUID(),
      ]),
    '55000',
  );
});

testWithDatabase('[PB-068] ciclo de publicação da mensagem é controlado', async (client) => {
  const registrado = await registrar(client, evento());
  const [{ id }] = await mensagemDo(client, registrado.id);

  // Publicador coleta a fila sem bloquear outras instâncias.
  const coleta = await client.query(
    `SELECT id FROM caixa_saida WHERE situacao = 'pendente' AND disponivel_em <= CURRENT_TIMESTAMP AND id = $1
     ORDER BY disponivel_em FOR UPDATE SKIP LOCKED`,
    [id],
  );
  assert.equal(coleta.rowCount, 1);

  await client.query(
    `UPDATE caixa_saida SET situacao = 'processando', tentativas = tentativas + 1,
       bloqueado_ate = CURRENT_TIMESTAMP + interval '30 seconds' WHERE id = $1`,
    [id],
  );
  // Falha transitória: volta para pendente com backoff e erro registrado.
  await client.query(
    `UPDATE caixa_saida SET situacao = 'pendente', bloqueado_ate = NULL, ultimo_erro = 'timeout',
       disponivel_em = CURRENT_TIMESTAMP + interval '1 minute' WHERE id = $1`,
    [id],
  );

  await rejeita(
    client,
    () => client.query(`UPDATE caixa_saida SET situacao = 'publicado' WHERE id = $1`, [id]),
    '23514',
    'caixa_saida_publicado_em_compativel',
  );
  await rejeita(
    client,
    () => client.query(`UPDATE caixa_saida SET bloqueado_ate = CURRENT_TIMESTAMP WHERE id = $1`, [id]),
    '23514',
    'caixa_saida_bloqueio_compativel',
  );
  await rejeita(
    client,
    () => client.query(`UPDATE caixa_saida SET situacao = 'enviado' WHERE id = $1`, [id]),
    '23514',
    'caixa_saida_situacao_valida',
  );
  await rejeita(client, () => client.query('UPDATE caixa_saida SET tentativas = 0 WHERE id = $1', [id]), '55000');
  await rejeita(
    client,
    () => client.query(`UPDATE caixa_saida SET topico = 'outro.topico' WHERE id = $1`, [id]),
    '55000',
  );
  await rejeita(
    client,
    () => client.query('UPDATE caixa_saida SET evento_id = gen_random_uuid() WHERE id = $1', [id]),
    '55000',
  );
  await rejeita(client, () => client.query('DELETE FROM caixa_saida WHERE id = $1', [id]), '55000');
  await rejeita(client, () => client.query('TRUNCATE caixa_saida'), '55000');

  const {
    rows: [publicada],
  } = await client.query(
    `UPDATE caixa_saida SET situacao = 'publicado', publicado_em = CURRENT_TIMESTAMP, ultimo_erro = NULL
     WHERE id = $1 RETURNING *`,
    [id],
  );
  assert.equal(publicada.situacao, 'publicado');
  assert.equal(publicada.tentativas, 1);
  assert.ok(publicada.atualizado_em >= publicada.criado_em);

  await rejeita(
    client,
    () => client.query(`UPDATE caixa_saida SET situacao = 'pendente', publicado_em = NULL WHERE id = $1`, [id]),
    '55000',
  );

  // Limpeza de mensagens publicadas é permitida; o evento permanece no histórico.
  const removida = await client.query('DELETE FROM caixa_saida WHERE id = $1', [id]);
  assert.equal(removida.rowCount, 1);
  const eventos = await client.query('SELECT 1 FROM eventos_dominio WHERE id = $1', [registrado.id]);
  assert.equal(eventos.rowCount, 1);
});

testWithDatabase('[PB-068] mensagem que esgotou tentativas pode ser marcada como falha', async (client) => {
  const registrado = await registrar(client, evento());
  const [{ id }] = await mensagemDo(client, registrado.id);
  const {
    rows: [falha],
  } = await client.query(
    `UPDATE caixa_saida SET situacao = 'falhou', tentativas = 5, ultimo_erro = 'destino indisponível'
     WHERE id = $1 RETURNING situacao, tentativas`,
    [id],
  );
  assert.deepEqual(falha, { situacao: 'falhou', tentativas: 5 });
  await rejeita(client, () => client.query('DELETE FROM caixa_saida WHERE id = $1', [id]), '55000');
});
