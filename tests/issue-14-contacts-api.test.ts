import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/contacts/route.ts";
import { getPrismaClient } from "../src/lib/prisma.ts";
import { SESSION_COOKIE } from "../src/lib/auth-service.ts";

const SENHA_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0";

async function createAuthenticatedSession(nome = "Admin Teste Listagem") {
  const prisma = getPrismaClient();
  const actorId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  await prisma.usuario.create({
    data: {
      id: actorId,
      nome,
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
  return { actorId, token };
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

describe("Issue #14: GET /api/contacts - Integração PostgreSQL da listagem", () => {
  const seededIds: string[] = [];
  let sessionToken = "";
  let ownerId = "";

  before(async () => {
    const prisma = getPrismaClient();
    const session = await createAuthenticatedSession("Operador Listagem DB");
    sessionToken = session.token;
    ownerId = session.actorId;
  });

  after(async () => {
    await getPrismaClient().$disconnect();
  });

  test("rejeita requisições sem sessão válida (status 401)", async () => {
    const req = createRequest("http://localhost/api/contacts?page=1");
    const res = await GET(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /sessão/i);
  });

  test("retorna lista vazia (empty state real) quando não há correspondência no PostgreSQL", async () => {
    const req = createRequest(
      `http://localhost/api/contacts?q=nao-existe-${randomUUID()}`,
      sessionToken,
    );
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 0);
    assert.deepEqual(body.contacts, []);
    assert.equal(body.totalPages, 1);
  });

  test("seed no PostgreSQL: paginação, filtros, ownerName, alinhamento de etapa (0-3 vs ordem 1-4), opt-out e CSV", async () => {
    const prisma = getPrismaClient();
    const origens = await prisma.origem.findMany();
    const etapas = await prisma.etapaCaptacao.findMany({
      orderBy: { ordem: "asc" },
    });
    const origemSite = origens.find((o) => o.codigo === "site")!;
    const origemWhatsApp = origens.find((o) => o.codigo === "whatsapp")!;

    const batchTag = `list14-${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 6; i++) {
      const isInbound = i % 2 === 0;
      const stageIdx = i % 4;
      const created = await prisma.contato.create({
        data: {
          nome: i === 0 ? `Helena ${batchTag}` : `Contato ${i} ${batchTag}`,
          tipoPessoa: "PF",
          email: `c${i}-${batchTag}@luz.example`,
          telefone: `8699999000${i}`,
          origemId: isInbound ? origemSite.id : origemWhatsApp.id,
          classificacao: isInbound ? "inbound" : "outbound",
          etapaCaptacaoId: etapas[stageIdx].id,
          responsavelId: ownerId,
          criadoPorId: ownerId,
          dataCadastro: new Date(Date.now() - i * 1000),
        },
      });
      seededIds.push(created.id);
    }

    // Registra descadastro no primeiro contato para validar situacao='descadastrado'
    await prisma.respostaContato.create({
      data: {
        contatoId: seededIds[0],
        classificacao: "descadastro",
        conteudo: "Não desejo receber e-mails",
        autorId: ownerId,
      },
    });

    // 1. Paginação real no PostgreSQL
    const res1 = await GET(
      createRequest(
        `http://localhost/api/contacts?q=${batchTag}&page=1&pageSize=4`,
        sessionToken,
      ),
    );
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.page, 1);
    assert.equal(body1.pageSize, 4);
    assert.equal(body1.total, 6);
    assert.equal(body1.totalPages, 2);
    assert.equal(body1.contacts.length, 4);
    assert.equal(body1.contacts[0].ownerName, "Operador Listagem DB");

    const res2 = await GET(
      createRequest(
        `http://localhost/api/contacts?q=${batchTag}&page=2&pageSize=4`,
        sessionToken,
      ),
    );
    const body2 = await res2.json();
    assert.equal(body2.contacts.length, 2);
    const ids1 = new Set(body1.contacts.map((c: any) => c.id));
    for (const c of body2.contacts) {
      assert.equal(ids1.has(c.id), false);
    }

    // 2. Busca por nome + verificação de optOut: true (situacao='descadastrado')
    const resHelena = await GET(
      createRequest(
        `http://localhost/api/contacts?q=Helena+${batchTag}`,
        sessionToken,
      ),
    );
    const bodyHelena = await resHelena.json();
    assert.equal(bodyHelena.total, 1);
    assert.equal(bodyHelena.contacts[0].optOut, true);
    assert.equal(bodyHelena.contacts[0].stage, 0);

    // 3. Filtro por stage=3 (Decisão de doação -> ordem=4 no PostgreSQL)
    const resStage3 = await GET(
      createRequest(
        `http://localhost/api/contacts?q=${batchTag}&stage=3`,
        sessionToken,
      ),
    );
    const bodyStage3 = await resStage3.json();
    assert.equal(bodyStage3.total, 1);
    assert.equal(bodyStage3.contacts[0].stage, 3);

    // 4. Filtro por funnel=Inbound e owner=<uuid>
    const resInbound = await GET(
      createRequest(
        `http://localhost/api/contacts?q=${batchTag}&funnel=Inbound&owner=${ownerId}`,
        sessionToken,
      ),
    );
    const bodyInbound = await resInbound.json();
    assert.equal(bodyInbound.total, 3);
    assert.ok(bodyInbound.contacts.every((c: any) => c.funnel === "Inbound"));

    // 5. UUID inválido em owner ou ids retorna vazio (200) sem cair em fallback de demonstração
    const resBadOwner = await GET(
      createRequest(
        `http://localhost/api/contacts?owner=id-legado-invalido`,
        sessionToken,
      ),
    );
    assert.equal(resBadOwner.status, 200);
    assert.equal((await resBadOwner.json()).total, 0);

    // 6. Exportação CSV selecionada com nomes oficiais das etapas e UTF-8 BOM
    const csvRes = await GET(
      createRequest(
        `http://localhost/api/contacts?export=csv&ids=${seededIds[0]},${seededIds[1]}`,
        sessionToken,
      ),
    );
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type") || "", /text\/csv/);
    const bytes = new Uint8Array(await csvRes.clone().arrayBuffer());
    assert.equal(bytes[0], 0xef);
    assert.equal(bytes[1], 0xbb);
    assert.equal(bytes[2], 0xbf);

    const csvText = await csvRes.text();
    const lines = csvText.trim().split("\r\n");
    assert.equal(lines.length, 3);
    assert.ok(
      csvText.includes(
        "Nome;Email;Telefone;Tipo;Origem;Funil;Etapa;Status;Identificação",
      ),
    );
    assert.ok(csvText.includes("Aprendizado e descoberta"));
    assert.ok(csvText.includes("Reconhecimento do problema"));

    // 7. Aba Doadores mantém compatibilidade até PB-060/PB-061
    const resDonors = await GET(
      createRequest("http://localhost/api/contacts?tab=donors&pageSize=50", sessionToken),
    );
    assert.equal(resDonors.status, 200);
    const bodyDonors = await resDonors.json();
    assert.ok(bodyDonors.contacts.every((c: any) => Boolean(c.plan)));
  });
});
