const assert = require('node:assert/strict');
const { testWithDatabase } = require('./helpers/postgres-test.cjs');

testWithDatabase(
  'migration cria instituicao, persiste dados e aplica validacoes',
  async (client) => {
    const appliedMigration = await client.query(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      ['20261022100000_create_instituicoes'],
    );
    assert.equal(appliedMigration.rowCount, 1, 'a migration de instituições deve estar aplicada');

    const inserted = await client.query(
      `INSERT INTO instituicoes (nome, documento, cidade, uf, fuso_horario, email_remetente)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, criado_em, nome, documento, cidade, uf, fuso_horario,
                 email_remetente, atualizado_em`,
      [
        'Instituto Luz da Esperança',
        '12345678000195',
        'São Paulo',
        'SP',
        'America/Sao_Paulo',
        'contato@luz.example',
      ],
    );

    assert.equal(inserted.rowCount, 1);
    assert.match(inserted.rows[0].id, /^[0-9a-f-]{36}$/i);
    assert.equal(inserted.rows[0].nome, 'Instituto Luz da Esperança');
    assert.equal(inserted.rows[0].documento, '12345678000195');
    assert.equal(inserted.rows[0].cidade, 'São Paulo');
    assert.equal(inserted.rows[0].uf, 'SP');
    assert.equal(inserted.rows[0].fuso_horario, 'America/Sao_Paulo');
    assert.equal(inserted.rows[0].email_remetente, 'contato@luz.example');
    assert.ok(inserted.rows[0].criado_em instanceof Date);
    assert.ok(inserted.rows[0].atualizado_em instanceof Date);

    const persisted = await client.query(
      'SELECT nome, documento, cidade, uf, fuso_horario FROM instituicoes WHERE id = $1',
      [inserted.rows[0].id],
    );
    assert.deepEqual(persisted.rows[0], {
      nome: 'Instituto Luz da Esperança',
      documento: '12345678000195',
      cidade: 'São Paulo',
      uf: 'SP',
      fuso_horario: 'America/Sao_Paulo',
    });

    const assertRejected = async (sql, code, message) => {
      await client.query('SAVEPOINT expected_failure');
      try {
        await assert.rejects(client.query(sql), (error) => error.code === code, message);
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT expected_failure');
        await client.query('RELEASE SAVEPOINT expected_failure');
      }
    };

    await assertRejected(
      `INSERT INTO instituicoes (nome, cidade, uf) VALUES ('Outra', 'Campinas', 'SP')`,
      '23505',
      'a tabela deve aceitar no máximo uma instituição titular',
    );
    await assertRejected(
      `INSERT INTO instituicoes (nome, documento, cidade, uf)
       VALUES ('Documento inválido', '123', 'São Paulo', 'SP')`,
      '23514',
      'o documento deve conter 14 dígitos',
    );
    await assertRejected(
      `INSERT INTO instituicoes (nome, cidade, uf, fuso_horario)
       VALUES ('Fuso inválido', 'São Paulo', 'SP', 'Fuso/Inexistente')`,
      '22023',
      'o fuso deve existir em pg_timezone_names',
    );
  },
);
