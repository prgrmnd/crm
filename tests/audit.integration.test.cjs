const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

async function insertEvent(client, overrides = {}) {
  const correlationId = overrides.correlationId || randomUUID();
  const actorId = Object.hasOwn(overrides, 'actorId') ? overrides.actorId : randomUUID();
  const contactId = overrides.contactId || randomUUID();
  const result = await client.query(
    `INSERT INTO eventos_auditoria
       (ator_tipo, ator_id, contato_id, acao, entidade_tipo, entidade_id,
        correlacao_id, antes, depois)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     RETURNING id, ator_id, correlacao_id, antes, depois`,
    [
      overrides.actorType || 'usuario',
      actorId,
      contactId,
      overrides.action || 'Contato atualizado',
      overrides.entityType || 'Contato',
      overrides.entityId || contactId,
      correlationId,
      overrides.before === undefined ? null : JSON.stringify(overrides.before),
      overrides.after === undefined ? null : JSON.stringify(overrides.after),
    ],
  );
  return result.rows[0];
}

testWithDatabase(
  'eventos_auditoria persiste correlacao_id e snapshots para a linha do tempo',
  async (client) => {
    const correlationId = randomUUID();
    const event = await insertEvent(client, {
      correlationId,
      before: { nome: 'Nome anterior' },
      after: { nome: 'Nome atualizado' },
    });

    assert.match(event.id, /^[0-9a-f-]{36}$/i);
    assert.equal(event.correlacao_id, correlationId);
    assert.deepEqual(event.antes, { nome: 'Nome anterior' });
    assert.deepEqual(event.depois, { nome: 'Nome atualizado' });
  },
);

testWithDatabase(
  'eventos_auditoria rejeita snapshots com credenciais, senhas ou tokens',
  async (client) => {
    await assert.rejects(
      insertEvent(client, {
        before: { perfil: { passwordHash: 'nao-persistir' } },
      }),
      (error) => error.code === '23514',
    );
  },
);

testWithDatabase(
  'ator_id e obrigatorio para usuario e nulo somente para Sistema',
  async (client) => {
    await client.query('SAVEPOINT ator_id_invalido');
    await assert.rejects(
      insertEvent(client, { actorType: 'usuario', actorId: null }),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT ator_id_invalido');
    await client.query('RELEASE SAVEPOINT ator_id_invalido');

    const systemEvent = await insertEvent(client, {
      actorType: 'sistema',
      actorId: null,
    });
    assert.equal(systemEvent.ator_id, null);
  },
);

testWithDatabase(
  'eventos_auditoria bloqueia UPDATE, DELETE e TRUNCATE',
  async (client) => {
    const event = await insertEvent(client);

    async function assertBlocked(statement) {
      await client.query('SAVEPOINT antes_da_mutacao');
      await assert.rejects(client.query(statement), (error) => error.code === '55000');
      await client.query('ROLLBACK TO SAVEPOINT antes_da_mutacao');
      await client.query('RELEASE SAVEPOINT antes_da_mutacao');
    }

    await assertBlocked(
      `UPDATE eventos_auditoria SET acao = 'alterado' WHERE id = '${event.id}'`,
    );
    await assertBlocked(`DELETE FROM eventos_auditoria WHERE id = '${event.id}'`);
    await assertBlocked('TRUNCATE eventos_auditoria');

    const persisted = await client.query(
      'SELECT id FROM eventos_auditoria WHERE id = $1',
      [event.id],
    );
    assert.equal(persisted.rowCount, 1);
  },
);
