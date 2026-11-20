import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { NextRequest } from "next/server";
import { GET as listContactsRoute, POST as createContactRoute } from "../src/app/api/contacts/route.ts";
import {
  GET as getContactRoute,
  PATCH as updateContactRoute,
  DELETE as deleteContactRoute,
  POST as legacyOptOutRoute,
} from "../src/app/api/contacts/[id]/route.ts";
import {
  GET as listInteractionsRoute,
  POST as createInteractionRoute,
} from "../src/app/api/contacts/[id]/interacoes/route.ts";
import {
  GET as listResponsesRoute,
  POST as createResponseRoute,
} from "../src/app/api/contacts/[id]/respostas/route.ts";
import { GET as listUsersRoute } from "../src/app/api/users/route.ts";
import { softDeleteContactInDatabase, ContactServiceError } from "../src/lib/contact-service.ts";
import { getPrismaClient } from "../src/lib/prisma.ts";
import { SESSION_COOKIE } from "../src/lib/auth-service.ts";

const SENHA_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObGfvJpYxMzKn0";

after(async () => {
  await getPrismaClient().$disconnect();
});

async function createSession(
  profile: "administrador" | "operador_captacao" = "administrador",
  nome = "Usuário Teste",
) {
  const prisma = getPrismaClient();
  const actorId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  await prisma.usuario.create({
    data: {
      id: actorId,
      nome,
      email: `${actorId}@luz.example`,
      senhaHash: SENHA_HASH,
      perfil: profile,
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

function makeRequest(
  url: string,
  method: string,
  token?: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) headers.cookie = `${SESSION_COOKIE}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("Integração Sprint 1 → PostgreSQL (Contatos, Ficha 360°, Interações, Opt-out e Operadores)", () => {
  test("GET /api/users exige sessão e retorna operadores ativos do PostgreSQL", async () => {
    const unauth = await listUsersRoute(
      makeRequest("http://localhost/api/users", "GET"),
    );
    assert.equal(unauth.status, 401);

    const { actorId, token } = await createSession(
      "administrador",
      "Operadora Maria",
    );
    const res = await listUsersRoute(
      makeRequest("http://localhost/api/users?ativo=true", "GET", token),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.users));
    assert.ok(body.users.some((u: any) => u.id === actorId && u.name === "Operadora Maria"));
  });

  test("POST /api/contacts cria contato no PostgreSQL com idempotência, regra Inbound e bloqueio de duplicidade (409)", async () => {
    const unauth = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", undefined, {
        name: "Sem Sessão",
        email: "semsessao@luz.example",
        origin: "Site",
      }),
    );
    assert.equal(unauth.status, 401);

    const { actorId, token } = await createSession("administrador", "Admin Cadastro");

    // Site + Outbound deve ser rejeitado (400)
    const badInbound = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, {
        name: "Regra Inbound",
        email: `inbound-${randomUUID()}@luz.example`,
        origin: "Site",
        funnel: "Outbound",
      }),
    );
    assert.equal(badInbound.status, 400);

    // Sem e-mail e sem telefone deve ser rejeitado (400)
    const noChannel = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, {
        name: "Sem Meio",
        origin: "WhatsApp",
        funnel: "Outbound",
      }),
    );
    assert.equal(noChannel.status, 400);

    const email = `contato-${randomUUID()}@luz.example`;
    const idempotencyKey = randomUUID();
    const correlationId = randomUUID();
    const payload = {
      name: "Ana Esperança",
      type: "PF",
      email: `  ${email.toUpperCase()}  `,
      phone: "(86) 99988-7766",
      document: "529.982.247-25",
      origin: "Site",
      funnel: "Inbound",
      stage: 1,
    };

    const res1 = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, payload, {
        "idempotency-key": idempotencyKey,
        "x-correlation-id": correlationId,
      }),
    );
    assert.equal(res1.status, 201);
    assert.equal(res1.headers.get("x-correlation-id"), correlationId);
    const body1 = await res1.json();
    assert.equal(body1.contact.name, "Ana Esperança");
    assert.equal(body1.contact.email, email);
    assert.equal(body1.contact.phone, "86999887766");
    assert.equal(body1.contact.document, "52998224725");
    assert.equal(body1.contact.origin, "Site");
    assert.equal(body1.contact.funnel, "Inbound");
    assert.equal(body1.contact.stage, 1);
    assert.equal(body1.contact.owner, actorId);
    assert.equal(body1.contact.ownerName, "Admin Cadastro");
    assert.equal(body1.contact.version, 1);
    assert.equal(body1.contact.optOut, false);

    // Repetição com mesma Idempotency-Key devolve mesma resposta sem duplicar
    const resReplay = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, payload, {
        "idempotency-key": idempotencyKey,
      }),
    );
    assert.equal(resReplay.status, 201);
    const bodyReplay = await resReplay.json();
    assert.equal(bodyReplay.contact.id, body1.contact.id);

    // Duplicidade de e-mail com outra requisição retorna 409
    const dupEmail = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, {
        name: "Duplicado Email",
        email,
        origin: "WhatsApp",
        funnel: "Outbound",
      }),
    );
    assert.equal(dupEmail.status, 409);

    // Duplicidade de documento retorna 409
    const dupDoc = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, {
        name: "Duplicado Doc",
        email: `outro-${randomUUID()}@luz.example`,
        document: "52998224725",
        origin: "WhatsApp",
        funnel: "Outbound",
      }),
    );
    assert.equal(dupDoc.status, 409);

    // Verifica auditoria gravada no PostgreSQL
    const prisma = getPrismaClient();
    const audits = await prisma.eventoAuditoria.findMany({
      where: { correlacaoId: correlationId, contatoId: body1.contact.id },
    });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].acao, "Contato cadastrado");
  });

  test("PATCH /api/contacts/[id] aplica controle otimista (versao 409), preserva etapa e registra auditoria", async () => {
    const { token } = await createSession("administrador", "Admin Edição");
    const email = `editar-${randomUUID()}@luz.example`;

    const createdRes = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, {
        name: "Contato Original",
        email,
        origin: "WhatsApp",
        funnel: "Outbound",
        stage: 2,
      }),
    );
    assert.equal(createdRes.status, 201);
    const { contact } = await createdRes.json();

    // Edição válida com version=1, tentando passar stage=0 (deve ser ignorado e preservar stage=2)
    const patchRes = await updateContactRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "PATCH", token, {
        version: 1,
        name: "Contato Atualizado",
        origin: "Indicação",
        funnel: "Inbound",
        stage: 0,
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.contact.name, "Contato Atualizado");
    assert.equal(patched.contact.origin, "Indicação");
    assert.equal(patched.contact.funnel, "Inbound");
    assert.equal(patched.contact.stage, 2, "Edição cadastral não pode alterar a etapa");
    assert.equal(patched.contact.version, 2);

    // Conflito de concorrência usando versão obsoleta (version=1) -> 409
    const stalePatch = await updateContactRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "PATCH", token, {
        version: 1,
        name: "Conflito",
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(stalePatch.status, 409);
  });

  test("POST /api/contacts/[id]/interacoes persiste interação imutável e valida data futura/resumo", async () => {
    const { actorId, token } = await createSession("operador_captacao", "Operador Interação");
    const createdRes = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, {
        name: "Contato Interação",
        email: `interacao-${randomUUID()}@luz.example`,
        origin: "Evento",
        funnel: "Outbound",
      }),
    );
    const { contact } = await createdRes.json();

    // Data futura -> 400
    const futureRes = await createInteractionRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/interacoes`, "POST", token, {
        canal: "Reunião presencial",
        ocorridoEm: new Date(Date.now() + 3600_000).toISOString(),
        resumo: "Tentativa futura",
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(futureRes.status, 400);

    // Resumo vazio -> 400
    const emptySummary = await createInteractionRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/interacoes`, "POST", token, {
        canal: "telefone",
        ocorridoEm: new Date().toISOString(),
        resumo: "   ",
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(emptySummary.status, 400);

    // Resumo > 3000 chars -> 400
    const tooLong = await createInteractionRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/interacoes`, "POST", token, {
        canal: "email",
        ocorridoEm: new Date().toISOString(),
        resumo: "x".repeat(3001),
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(tooLong.status, 400);

    // Criação válida com normalização de "Reunião presencial" -> "reuniao" e idempotência
    const key = randomUUID();
    const validPayload = {
      canal: "Reunião presencial",
      ocorridoEm: new Date(Date.now() - 60_000).toISOString(),
      resumo: "Conversa acolhedora sobre as obras sociais.",
    };
    const okRes = await createInteractionRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/interacoes`, "POST", token, validPayload, {
        "idempotency-key": key,
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(okRes.status, 201);
    const okBody = await okRes.json();
    assert.equal(okBody.interaction.canal, "reuniao");
    assert.equal(okBody.interaction.autorId, actorId);

    // Replay idempotente
    const replayRes = await createInteractionRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/interacoes`, "POST", token, validPayload, {
        "idempotency-key": key,
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(replayRes.status, 201);
    assert.equal((await replayRes.json()).interaction.id, okBody.interaction.id);

    // GET interações e Ficha 360° refletem a interação
    const listRes = await listInteractionsRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/interacoes`, "GET", token),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(listRes.status, 200);
    assert.equal((await listRes.json()).interactions.length, 1);

    const sheetRes = await getContactRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "GET", token),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(sheetRes.status, 200);
    const sheet = await sheetRes.json();
    assert.ok(sheet.contact.history.some((h: any) => h.action === "Contato por Reunião presencial"));
  });

  test("POST /api/contacts/[id]/respostas persiste opt-out via trigger PB-058 e bloqueia chamadas sem sessão", async () => {
    const { token } = await createSession("operador_captacao", "Operador OptOut");
    const createdRes = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", token, {
        name: "Contato OptOut",
        email: `optout-${randomUUID()}@luz.example`,
        origin: "Instagram",
        funnel: "Inbound",
      }),
    );
    const { contact } = await createdRes.json();

    // Rota legada POST /api/contacts/[id] agora exige sessão (401)
    const unauthLegacy = await legacyOptOutRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "POST", undefined, {
        action: "optOut",
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(unauthLegacy.status, 401);

    // Resposta positiva
    const posRes = await createResponseRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/respostas`, "POST", token, {
        classificacao: "Positiva",
        conteudo: "Gostaria de receber mais informações.",
      }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(posRes.status, 201);
    assert.equal((await posRes.json()).optOut, false);

    // Descadastro sem motivo informado (optOutForm opcional) aplica conteúdo padrão e dispara trigger PB-058
    const optOutKey = randomUUID();
    const optRes = await createResponseRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/respostas`, "POST", token, {
        classificacao: "descadastro",
        conteudo: "",
      }, { "idempotency-key": optOutKey }),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(optRes.status, 201);
    const optBody = await optRes.json();
    assert.equal(optBody.optOut, true);
    assert.equal(optBody.preference.situacao, "descadastrado");
    assert.equal(optBody.preference.vigenteAte, null);

    // Verifica no banco que houve encerramento da vigência anterior + 1 único evento comunicacao.descadastro
    const prisma = getPrismaClient();
    const prefs = await prisma.preferenciaComunicacao.findMany({
      where: { contatoId: contact.id, canal: "email" },
      orderBy: { vigenteDesde: "asc" },
    });
    assert.equal(prefs.length, 2);
    assert.equal(prefs[0].situacao, "permitido");
    assert.ok(prefs[0].vigenteAte !== null);
    assert.equal(prefs[1].situacao, "descadastrado");
    assert.equal(prefs[1].vigenteAte, null);

    const optAudits = await prisma.eventoAuditoria.findMany({
      where: { contatoId: contact.id, acao: "comunicacao.descadastro" },
    });
    assert.equal(optAudits.length, 1);

    // GET /api/contacts e GET /api/contacts/[id] refletem optOut: true
    const listRes = await listContactsRoute(
      makeRequest(`http://localhost/api/contacts?ids=${contact.id}`, "GET", token),
    );
    const listBody = await listRes.json();
    assert.equal(listBody.contacts.length, 1);
    assert.equal(listBody.contacts[0].optOut, true);

    const listResp = await listResponsesRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}/respostas`, "GET", token),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(listResp.status, 200);
    assert.equal((await listResp.json()).responses.length, 2);
  });

  test("DELETE /api/contacts/[id] valida sessão (401), perfil Admin (403), soft-delete + auditoria (200) e trava financeira (409)", async () => {
    const admin = await createSession("administrador", "Admin Exclusão");
    const operator = await createSession("operador_captacao", "Operador Exclusão");

    const createdRes = await createContactRoute(
      makeRequest("http://localhost/api/contacts", "POST", admin.token, {
        name: "Contato Para Excluir",
        email: `excluir-${randomUUID()}@luz.example`,
        origin: "WhatsApp",
        funnel: "Outbound",
      }),
    );
    const { contact } = await createdRes.json();

    // 401 sem sessão
    const unauth = await deleteContactRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "DELETE"),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(unauth.status, 401);

    // 403 para operador
    const forbidden = await deleteContactRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "DELETE", operator.token),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(forbidden.status, 403);

    // 409 quando há vínculo financeiro (verificado via hook de serviço dedicado)
    const prisma = getPrismaClient();
    await assert.rejects(
      prisma.$transaction((tx) =>
        softDeleteContactInDatabase(
          tx,
          { id: admin.actorId, name: "Admin Exclusão", email: "a@b.c", profile: "administrador" },
          contact.id,
          randomUUID(),
          async () => true,
        ),
      ),
      (err: unknown) =>
        err instanceof ContactServiceError &&
        err.status === 409 &&
        /histórico financeiro/.test(err.message),
    );

    // 200 exclusão lógica com Idempotency-Key e x-correlation-id
    const correlationId = randomUUID();
    const delKey = randomUUID();
    const delRes = await deleteContactRoute(
      makeRequest(
        `http://localhost/api/contacts/${contact.id}`,
        "DELETE",
        admin.token,
        undefined,
        {
          "x-correlation-id": correlationId,
          "idempotency-key": delKey,
        },
      ),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(delRes.status, 200);
    assert.equal(delRes.headers.get("x-correlation-id"), correlationId);

    // Replay idempotente devolve 200 sem erro 404
    const delReplay = await deleteContactRoute(
      makeRequest(
        `http://localhost/api/contacts/${contact.id}`,
        "DELETE",
        admin.token,
        undefined,
        { "idempotency-key": delKey },
      ),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(delReplay.status, 200);

    // Contato excluído logicamente retorna 404 em nova busca e em nova exclusão
    const getAfter = await getContactRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "GET", admin.token),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(getAfter.status, 404);

    const delAgain = await deleteContactRoute(
      makeRequest(`http://localhost/api/contacts/${contact.id}`, "DELETE", admin.token),
      { params: Promise.resolve({ id: contact.id }) },
    );
    assert.equal(delAgain.status, 404);

    // Confere registro em contatos.excluido_em e eventos_auditoria no PostgreSQL
    const client = new Client({
      connectionString: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
    });
    await client.connect();
    try {
      const row = await client.query(
        `SELECT excluido_em, versao FROM contatos WHERE id = $1`,
        [contact.id],
      );
      assert.equal(row.rowCount, 1);
      assert.ok(row.rows[0].excluido_em !== null);
      assert.equal(row.rows[0].versao, 2);

      const persisted = await client.query(
        `SELECT ator_tipo, ator_id, contato_id, acao, entidade_tipo, correlacao_id, antes, depois
         FROM eventos_auditoria WHERE correlacao_id = $1`,
        [correlationId],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].ator_tipo, "usuario");
      assert.equal(persisted.rows[0].ator_id, admin.actorId);
      assert.equal(persisted.rows[0].contato_id, contact.id);
      assert.equal(persisted.rows[0].acao, "Contato excluído");
      assert.equal(persisted.rows[0].entidade_tipo, "Contato");
      assert.equal(persisted.rows[0].depois, null);
    } finally {
      await client.end();
    }
  });
});
