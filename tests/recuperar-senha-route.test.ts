import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/auth/recuperar-senha/route.ts";
import { getPrismaClient } from "../src/lib/prisma.ts";
import { LIMITE_TENTATIVAS, limparRateLimit } from "../src/lib/rate-limit.ts";

const MENSAGEM = "Se o e-mail estiver cadastrado, você receberá as instruções.";
const prisma = getPrismaClient();

after(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  limparRateLimit();
});

function criarRequest(ip: string, body: unknown, bodyBruto?: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/recuperar-senha", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: bodyBruto ?? JSON.stringify(body),
  });
}

async function criarUsuario(ativo = true) {
  const email = `recuperar-${randomUUID()}@luz.example`;
  const hashGerado = await argon2.hash("Senha-segura-de-teste-2026", {
    type: argon2.argon2id,
  });
  const senhaHash = hashGerado.replace(
    /\$m=(\d+),p=(\d+),t=(\d+)\$/,
    (_: string, memory: string, parallelism: string, time: string) =>
      "$m=" + memory + ",t=" + time + ",p=" + parallelism + "$",
  );
  const usuario = await prisma.usuario.create({
    data: {
      nome: "Usuário de teste",
      email,
      senhaHash,
      perfil: "operador_captacao",
      ativo,
    },
  });
  return { usuario, email };
}

test("responde 200 idêntico para e-mail existente e inexistente", async () => {
  const { email } = await criarUsuario();

  const existente = await POST(criarRequest("10.0.0.1", { email }));
  const inexistente = await POST(
    criarRequest("10.0.0.2", { email: `naoexiste-${randomUUID()}@luz.example` }),
  );

  assert.equal(existente.status, 200);
  assert.equal(inexistente.status, 200);
  assert.deepEqual(await existente.json(), { message: MENSAGEM });
  assert.deepEqual(await inexistente.json(), { message: MENSAGEM });
});

test("emissão consecutiva invalida o token anterior sem erro 55000", async () => {
  const { usuario, email } = await criarUsuario();

  const res1 = await POST(criarRequest("10.0.0.3", { email }));
  const res2 = await POST(criarRequest("10.0.0.4", { email }));

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const tokens = await prisma.tokenRecuperacao.findMany({
    where: { usuarioId: usuario.id },
  });
  assert.equal(tokens.length, 2);
  assert.equal(
    tokens.filter((t) => t.invalidadoEm === null && t.consumidoEm === null).length,
    1,
  );
  assert.equal(tokens.filter((t) => t.invalidadoEm !== null).length, 1);
});

test("usuário inativo recebe 200 e nenhum token é criado", async () => {
  const { usuario, email } = await criarUsuario(false);

  const res = await POST(criarRequest("10.0.0.5", { email }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { message: MENSAGEM });
  const total = await prisma.tokenRecuperacao.count({
    where: { usuarioId: usuario.id },
  });
  assert.equal(total, 0);
});

test("payload inválido retorna 400 e não gasta cota do rate limit", async () => {
  const ip = "10.0.0.6";

  for (let i = 0; i < LIMITE_TENTATIVAS + 3; i++) {
    const res = await POST(criarRequest(ip, { email: "isso-nao-e-email" }));
    assert.equal(res.status, 400);
  }
  const semJson = await POST(criarRequest(ip, null, "{nao-e-json"));
  assert.equal(semJson.status, 400);

  const ok = await POST(
    criarRequest(ip, { email: `valido-${randomUUID()}@luz.example` }),
  );
  assert.equal(ok.status, 200);
});

test("429 após o limite de tentativas pelo mesmo IP", async () => {
  const ip = "10.0.0.7";

  for (let i = 0; i < LIMITE_TENTATIVAS; i++) {
    const res = await POST(
      criarRequest(ip, { email: `ip-${randomUUID()}@luz.example` }),
    );
    assert.equal(res.status, 200);
  }

  const bloqueada = await POST(
    criarRequest(ip, { email: `ip-${randomUUID()}@luz.example` }),
  );
  assert.equal(bloqueada.status, 429);
});

test("429 após o limite de tentativas pelo mesmo e-mail normalizado", async () => {
  const id = randomUUID();

  for (let i = 0; i < LIMITE_TENTATIVAS; i++) {
    const variacao = i % 2 === 0 ? `Alvo-${id}@Luz.example` : `  alvo-${id}@luz.example `;
    const res = await POST(criarRequest(`10.0.1.${i}`, { email: variacao }));
    assert.equal(res.status, 200);
  }

  const bloqueada = await POST(
    criarRequest("10.0.1.99", { email: `ALVO-${id}@luz.example` }),
  );
  assert.equal(bloqueada.status, 429);
});