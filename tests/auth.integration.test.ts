import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import argon2 from "argon2";
import {
  authenticate,
  getActiveSession,
  SESSION_IDLE_LIMIT_MS,
  SESSION_COOKIE,
} from "../src/lib/auth-service.ts";
import { getPrismaClient } from "../src/lib/prisma.ts";
import { POST as loginRoute } from "../src/app/api/auth/login/route.ts";
import {
  GET as getSessionRoute,
  PUT as touchSessionRoute,
} from "../src/app/api/auth/session/route.ts";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route.ts";
import { NextRequest } from "next/server";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

test("login aplica bloqueio, registra auditoria e revoga sessões inativas", async (t) => {
  const prisma = getPrismaClient();
  t.after(async () => prisma.$disconnect());

  const password = "Senha-segura-de-teste-2026";
  const email = `login-${randomUUID()}@luz.example`;
  const generatedHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });
  const senhaHash = generatedHash.replace(
    /\$m=(\d+),p=(\d+),t=(\d+)\$/,
    (_: string, memory: string, parallelism: string, time: string) =>
      "$m=" + memory + ",t=" + time + ",p=" + parallelism + "$",
  );
  const user = await prisma.usuario.create({
    data: {
      nome: "Usuário de teste",
      email,
      senhaHash,
      perfil: "administrador",
    },
  });
  const headers = new Headers({
    "x-real-ip": "192.0.2.10",
    "user-agent": "auth-integration-test",
  });

  for (let attempt = 1; attempt < 5; attempt++) {
    assert.equal(
      (await authenticate(email, "senha-incorreta", headers)).status,
      401,
    );
  }
  const fifthAttempt = await authenticate(email, "senha-incorreta", headers);
  assert.equal(fifthAttempt.status, 429);
  assert.equal(fifthAttempt.retryAfter, 60);
  assert.equal(
    (await authenticate(email, "senha-incorreta", headers)).status,
    429,
  );

  const otherIp = new Headers({ "x-real-ip": "192.0.2.11" });
  assert.equal(
    (await authenticate(email, "senha-incorreta", otherIp)).status,
    401,
  );

  const latestAttempt = await prisma.tentativaLogin.findFirst({
    where: { identificadorHash: sha256(email), ip: "192.0.2.10" },
    orderBy: { criadoEm: "desc" },
  });
  assert.ok(latestAttempt?.bloqueadoAte);
  await prisma.tentativaLogin.updateMany({
    where: {
      identificadorHash: sha256(email),
      ip: "192.0.2.10",
      sucesso: false,
      bloqueadoAte: null,
    },
    data: { criadoEm: new Date(Date.now() - 120_000) },
  });
  const expiredLock = new Date(Date.now() - 1_000);
  await prisma.tentativaLogin.update({
    where: { id: latestAttempt.id },
    data: {
      criadoEm: new Date(expiredLock.getTime() - 60_000),
      bloqueadoAte: expiredLock,
    },
  });
  assert.equal(
    (await authenticate(email, "senha-incorreta", headers)).status,
    401,
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(
      (await authenticate(email, "senha-incorreta", headers)).status,
      401,
    );
  }
  const fifthAfterCooldown = await authenticate(
    email,
    "senha-incorreta",
    headers,
  );
  assert.equal(fifthAfterCooldown.status, 429);

  const secondLock = await prisma.tentativaLogin.findFirst({
    where: { identificadorHash: sha256(email), ip: "192.0.2.10" },
    orderBy: { criadoEm: "desc" },
  });
  assert.ok(secondLock?.bloqueadoAte);
  await prisma.tentativaLogin.updateMany({
    where: {
      identificadorHash: sha256(email),
      ip: "192.0.2.10",
      sucesso: false,
      bloqueadoAte: null,
    },
    data: { criadoEm: new Date(Date.now() - 120_000) },
  });
  const secondExpiredLock = new Date(Date.now() - 1_000);
  await prisma.tentativaLogin.update({
    where: { id: secondLock.id },
    data: {
      criadoEm: new Date(secondExpiredLock.getTime() - 60_000),
      bloqueadoAte: secondExpiredLock,
    },
  });

  const login = await authenticate(email, password, headers);
  assert.equal(login.status, 200);
  assert.equal(login.user?.profile, "administrador");
  assert.ok(login.token);
  assert.equal((await getActiveSession(login.token))?.id, user.id);
  assert.equal((await getActiveSession(login.token, true))?.id, user.id);

  const session = await prisma.sessao.findUnique({
    where: { tokenHash: sha256(login.token) },
  });
  assert.ok(session);
  assert.ok(
    session.expiraEm.getTime() - session.ultimoAcessoEm.getTime() >=
      SESSION_IDLE_LIMIT_MS - 1_000,
  );
  await prisma.sessao.update({
    where: { id: session.id },
    data: {
      criadoEm: new Date(Date.now() - SESSION_IDLE_LIMIT_MS - 60_000),
      ultimoAcessoEm: new Date(Date.now() - SESSION_IDLE_LIMIT_MS - 1_000),
      expiraEm: new Date(Date.now() + 60_000),
    },
  });
  assert.equal(await getActiveSession(login.token), null);
  assert.ok(
    (await prisma.sessao.findUnique({ where: { id: session.id } }))?.revogadaEm,
  );

  const loginResponse = await loginRoute(
    new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "192.0.2.12",
      },
      body: JSON.stringify({ email, password }),
    }),
  );
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.cookies.get(SESSION_COOKIE);
  assert.ok(cookie?.value);
  assert.equal(cookie.httpOnly, true);

  const cookieHeader = `${SESSION_COOKIE}=${cookie.value}`;
  const sessionRequest = () =>
    new NextRequest("http://localhost/api/auth/session", {
      headers: { cookie: cookieHeader },
    });
  const currentSession = await getSessionRoute(sessionRequest());
  assert.equal(currentSession.status, 200);
  assert.equal((await currentSession.json()).user.profile, "administrador");
  assert.equal((await touchSessionRoute(sessionRequest())).status, 200);
  assert.equal(
    (
      await logoutRoute(
        new NextRequest("http://localhost/api/auth/logout", {
          method: "POST",
          headers: { cookie: cookieHeader },
        }),
      )
    ).status,
    204,
  );
  assert.equal((await getSessionRoute(sessionRequest())).status, 401);

  const loginAudit = await prisma.eventoAuditoria.findMany({
    where: { entidadeId: user.id, acao: "Login realizado" },
  });
  const failureAudit = await prisma.eventoAuditoria.findMany({
    where: { entidadeId: user.id, acao: "Falha no login" },
  });
  const lockAudit = await prisma.eventoAuditoria.findMany({
    where: { entidadeId: user.id, acao: "Login bloqueado" },
  });
  assert.equal(loginAudit.length, 2);
  assert.ok(failureAudit.length >= 9);
  assert.equal(lockAudit.length, 2);
});
