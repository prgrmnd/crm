import "dotenv/config";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Defina ${name} antes de provisionar o administrador.`);
  }
  return value;
}

function getConfiguration() {
  const name = requiredEnvironment("BOOTSTRAP_ADMIN_NAME");
  const email = requiredEnvironment("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (name.length > 100) {
    throw new Error("BOOTSTRAP_ADMIN_NAME deve ter até 100 caracteres.");
  }
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL deve conter um e-mail válido.");
  }
  if (!password || password.length < 12 || password.length > 1024) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD deve ter entre 12 e 1024 caracteres.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL precisa estar configurada.");
  }

  return { name, email, password };
}

function databasePhcHash(hash) {
  const normalized = hash.replace(
    /\$m=(\d+),p=(\d+),t=(\d+)\$/,
    (_, memory, parallelism, time) =>
      "$m=" + memory + ",t=" + time + ",p=" + parallelism + "$",
  );
  if (
    !/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{16,}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "O formato Argon2id gerado não atende ao esquema do banco.",
    );
  }
  return normalized;
}

async function main() {
  const configuration = getConfiguration();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('luz-crm-bootstrap-admin', 0))",
    );
    const existingUsers = await client.query(
      "SELECT EXISTS (SELECT 1 FROM usuarios) AS has_users",
    );
    if (existingUsers.rows[0].has_users) {
      throw new Error(
        "Já existem usuários. O bootstrap só é permitido em uma instalação sem contas.",
      );
    }

    const passwordHash = databasePhcHash(
      await argon2.hash(configuration.password, { type: argon2.argon2id }),
    );
    const created = await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil)
       VALUES ($1, $2, $3, 'administrador')
       RETURNING id`,
      [configuration.name, configuration.email, passwordHash],
    );
    await client.query(
      `INSERT INTO eventos_auditoria (
         ator_tipo, ator_id, acao, entidade_tipo, entidade_id, correlacao_id
       ) VALUES ('sistema', NULL, 'Administrador inicial provisionado', 'Usuario', $1, $2)`,
      [created.rows[0].id, randomUUID()],
    );
    await client.query("COMMIT");
    console.log(`Administrador inicial provisionado: ${configuration.email}.`);
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha no bootstrap.");
  process.exitCode = 1;
});
