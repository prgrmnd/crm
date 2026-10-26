import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { DELETE } from "../src/app/api/contacts/[id]/route.ts";
import { getPrismaClient } from "../src/lib/prisma.ts";
import { SESSION_COOKIE } from "../src/lib/auth-service.ts";
import { NextRequest } from "next/server";
import D from "./fixtures/seed.cjs";
import type { CRMState } from "../src/types/crm.ts";

const SENHA_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0";

async function authenticatedRequest(
  body: unknown,
  extraHeaders: HeadersInit = {},
) {
  const prisma = getPrismaClient();
  const actorId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  await prisma.usuario.create({
    data: {
      id: actorId,
      nome: "Admin autenticado",
      email: `${actorId}@luz.example`,
      senhaHash: SENHA_HASH,
      perfil: "administrador",
    },
  });
  await prisma.sessao.create({
    data: {
      usuarioId: actorId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiraEm: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  return {
    actorId,
    request: new NextRequest("http://localhost/api/contacts/test", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${token}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }),
  };
}

describe("DELETE /api/contacts/[id] route", () => {
  test("rejects requests without a server session", async () => {
    const request = new NextRequest("http://localhost/api/contacts/test", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: D.seed(),
        user: { id: randomUUID(), name: "Forged admin", role: "Administrador" },
      }),
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ id: "contact-0" }),
    });
    assert.equal(response.status, 401);
  });

  test("returns 409 Conflict when contact has financial history", async () => {
    const state = D.seed() as CRMState;
    const donor = state.contacts.find(
      (c: { id: string }) => c.id === "contact-0",
    );
    assert.ok(donor, "donor contact should exist");

    const { request } = await authenticatedRequest({
      state,
      user: { id: randomUUID(), name: "Forged admin", role: "Administrador" },
    });

    const context = {
      params: Promise.resolve({ id: (donor as { id: string }).id }),
    };

    const response = await DELETE(request, context);
    // NextResponse exposes status property
    assert.equal((response as any).status, 409);
    const body = await (response as any).json();
    assert.equal(body.allowed, false);
    assert.match(body.error ?? body.reason, /histórico financeiro/);
  });

  test("persists sanitized audit event with the request correlation id", async () => {
    const state = D.seed() as CRMState;
    const contact = state.contacts.find(
      (c: { id: string }) => c.id === "contact-8",
    );
    assert.ok(contact, "lead contact should exist");
    contact.id = randomUUID();
    Object.assign(contact, {
      password: "must-not-be-stored",
      accessToken: "must-not-be-stored-either",
    });

    const correlationId = randomUUID();
    const { request, actorId } = await authenticatedRequest(
      {
        state,
        user: {
          id: randomUUID(),
          name: "Forged admin",
          role: "Administrador",
        },
      },
      { "x-correlation-id": correlationId },
    );
    const context = { params: Promise.resolve({ id: contact.id }) };
    const response = await DELETE(request, context);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-correlation-id"), correlationId);

    const client = new Client({
      connectionString: process.env.DATABASE_URL_TEST,
    });
    await client.connect();
    try {
      const persisted = await client.query(
        `SELECT ator_tipo, ator_id, contato_id, acao, entidade_tipo, correlacao_id,
                antes, depois
         FROM eventos_auditoria WHERE correlacao_id = $1`,
        [correlationId],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].ator_tipo, "usuario");
      assert.equal(persisted.rows[0].ator_id, actorId);
      assert.equal(persisted.rows[0].contato_id, contact.id);
      assert.equal(persisted.rows[0].entidade_tipo, "Contato");
      assert.equal(persisted.rows[0].depois, null);
      assert.equal("password" in persisted.rows[0].antes, false);
      assert.equal("accessToken" in persisted.rows[0].antes, false);
    } finally {
      await client.end();
      await getPrismaClient().$disconnect();
    }
  });
});
