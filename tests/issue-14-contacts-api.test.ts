import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/contacts/route.ts";
import { getPrismaClient } from "../src/lib/prisma.ts";
import { SESSION_COOKIE } from "../src/lib/auth-service.ts";

const SENHA_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0";

async function createAuthenticatedSession() {
  const prisma = getPrismaClient();
  const actorId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  await prisma.usuario.create({
    data: {
      id: actorId,
      nome: "Admin Teste Listagem",
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
  return token;
}

function createRequest(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) {
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest(url, {
    method: "GET",
    headers,
  });
}

describe("Issue #14: GET /api/contacts - Integração da listagem", () => {
  test("rejeita requisições sem sessão válida (status 401)", async () => {
    const req = createRequest("http://localhost/api/contacts?page=1");
    const res = await GET(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /sessão/i);
  });

  test("retorna contatos paginados no servidor com total e páginas", async () => {
    const token = await createAuthenticatedSession();
    const req = createRequest(
      "http://localhost/api/contacts?page=1&pageSize=5",
      token,
    );
    const res = await GET(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 5);
    assert.ok(body.total >= 5);
    assert.equal(body.contacts.length, 5);
    assert.equal(body.totalPages, Math.ceil(body.total / 5));
  });

  test("navegação entre páginas respeita o offset do servidor", async () => {
    const token = await createAuthenticatedSession();
    const req1 = createRequest(
      "http://localhost/api/contacts?page=1&pageSize=4",
      token,
    );
    const res1 = await GET(req1);
    const body1 = await res1.json();

    const req2 = createRequest(
      "http://localhost/api/contacts?page=2&pageSize=4",
      token,
    );
    const res2 = await GET(req2);
    const body2 = await res2.json();

    assert.equal(body1.contacts.length, 4);
    assert.equal(body2.contacts.length, 4);
    // As duas páginas não devem ter contatos em comum
    const ids1 = new Set(body1.contacts.map((c: any) => c.id));
    for (const c of body2.contacts) {
      assert.equal(
        ids1.has(c.id),
        false,
        `Contato ${c.id} apareceu em ambas as páginas`,
      );
    }
  });

  test("filtra por categoria / abas: Todos, Potenciais e Doadores", async () => {
    const token = await createAuthenticatedSession();

    // Tab Potenciais (leads)
    const reqLeads = createRequest(
      "http://localhost/api/contacts?tab=leads&pageSize=50",
      token,
    );
    const resLeads = await GET(reqLeads);
    const bodyLeads = await resLeads.json();
    assert.ok(bodyLeads.contacts.length > 0);
    for (const c of bodyLeads.contacts) {
      assert.equal(
        Boolean(c.plan),
        false,
        "Contato potencial não deve possuir plano",
      );
    }

    // Tab Doadores (donors)
    const reqDonors = createRequest(
      "http://localhost/api/contacts?tab=donors&pageSize=50",
      token,
    );
    const resDonors = await GET(reqDonors);
    const bodyDonors = await resDonors.json();
    assert.ok(bodyDonors.contacts.length > 0);
    for (const c of bodyDonors.contacts) {
      assert.equal(
        Boolean(c.plan),
        true,
        "Doador deve possuir plano de doação",
      );
    }

    // Tab Todos (all)
    const reqAll = createRequest(
      "http://localhost/api/contacts?tab=all&pageSize=50",
      token,
    );
    const resAll = await GET(reqAll);
    const bodyAll = await resAll.json();
    assert.equal(bodyAll.total, bodyLeads.total + bodyDonors.total);
  });

  test("filtra por busca textual (nome, e-mail, telefone, documento)", async () => {
    const token = await createAuthenticatedSession();
    const req = createRequest("http://localhost/api/contacts?q=Helena", token);
    const res = await GET(req);
    const body = await res.json();

    assert.ok(body.contacts.length > 0);
    assert.ok(
      body.contacts.some((c: any) => c.name.toLowerCase().includes("helena")),
    );
  });

  test("filtra por origem, canal de funil e status", async () => {
    const token = await createAuthenticatedSession();
    const req = createRequest(
      "http://localhost/api/contacts?funnel=Inbound&pageSize=50",
      token,
    );
    const res = await GET(req);
    const body = await res.json();

    assert.ok(body.contacts.length > 0);
    for (const c of body.contacts) {
      assert.equal(c.funnel.toLowerCase(), "inbound");
    }
  });

  test("exportação CSV filtrada considera todos os registros do filtro", async () => {
    const token = await createAuthenticatedSession();
    const req = createRequest(
      "http://localhost/api/contacts?export=csv&tab=donors",
      token,
    );
    const res = await GET(req);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/csv/);

    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    // UTF-8 BOM: 0xEF, 0xBB, 0xBF
    assert.equal(bytes[0], 0xef, "Primeiro byte deve ser 0xEF");
    assert.equal(bytes[1], 0xbb, "Segundo byte deve ser 0xBB");
    assert.equal(bytes[2], 0xbf, "Terceiro byte deve ser 0xBF");

    const csvText = await res.text();
    // Cabeçalhos
    assert.ok(
      csvText.includes(
        "Nome;Email;Telefone;Tipo;Origem;Funil;Etapa;Status;Identificação",
      ),
    );
    // Contém apenas doadores
    assert.ok(!csvText.includes("Potencial doador"));
  });

  test("exportação CSV selecionada considera somente os IDs informados", async () => {
    const token = await createAuthenticatedSession();
    const req = createRequest(
      "http://localhost/api/contacts?export=csv&ids=contact-0,contact-1",
      token,
    );
    const res = await GET(req);
    assert.equal(res.status, 200);

    const csvText = await res.text();
    const lines = csvText.trim().split("\r\n");
    // 1 linha de cabeçalho + 2 linhas de contatos
    assert.equal(
      lines.length,
      3,
      "Deve conter cabeçalho + 2 contatos selecionados",
    );
  });
});
