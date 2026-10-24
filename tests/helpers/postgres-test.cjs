const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL_TEST;

function testWithDatabase(name, fn) {
  test(
    name,
    { skip: !databaseUrl && 'Configure DATABASE_URL_TEST para executar testes de integração PostgreSQL.' },
    async (t) => {
      const parsedUrl = new URL(databaseUrl);
      const databaseName = parsedUrl.pathname.slice(1);
      assert.match(
        databaseName,
        /(^|[_-])test($|[_-])/i,
        'DATABASE_URL_TEST deve apontar para um banco cujo nome identifique um banco de teste.',
      );

      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      t.after(async () => {
        try {
          await client.query('ROLLBACK');
        } finally {
          await client.end();
        }
      });
      await client.query('BEGIN');

      return fn(client, t);
    },
  );
}

module.exports = { testWithDatabase };
