import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import { getPrismaClient } from "../src/lib/prisma.ts";
import {
  POST as redefinirSenhaRoute,
  GET as validarTokenRoute,
  validarComplexidadeSenha,
} from "../src/app/api/auth/redefinir-senha/route.ts";

process.env.DATABASE_URL ||= "postgresql://crm_test:crm_test@127.0.0.1:55432/crm_test";

const prisma = getPrismaClient();
let bancoDisponivel = false;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    bancoDisponivel = true;
  } catch {
    bancoDisponivel = false;
  }
});

after(async () => {
  await prisma.$disconnect();
});

const sha256 = (valor: string) =>
  crypto.createHash("sha256").update(valor).digest("hex");

function criarRequisicaoPost(body: unknown) {
  return new NextRequest("http://localhost/api/auth/redefinir-senha", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function criarRequisicaoGet(token?: string) {
  const url = token
    ? `http://localhost/api/auth/redefinir-senha?token=${encodeURIComponent(token)}`
    : "http://localhost/api/auth/redefinir-senha";
  return new NextRequest(url, { method: "GET" });
}

async function gerarSenhaHash(senha: string) {
  const hashGerado = await argon2.hash(senha, { type: argon2.argon2id });
  return hashGerado.replace(
    /\$m=(\d+),p=(\d+),t=(\d+)\$/,
    (_, memory, parallelism, time) =>
      `$m=${memory},t=${time},p=${parallelism}$`,
  );
}

test("validarComplexidadeSenha valida todos os critérios exigidos", () => {
  assert.equal(validarComplexidadeSenha(null).valida, false);
  assert.equal(validarComplexidadeSenha("").valida, false);
  assert.equal(validarComplexidadeSenha("Curto1!").valida, false); // < 8
  assert.equal(validarComplexidadeSenha("sem-maiuscula1!").valida, false);
  assert.equal(validarComplexidadeSenha("SEM-MINUSCULA1!").valida, false);
  assert.equal(validarComplexidadeSenha("SemNumero!@#").valida, false);
  assert.equal(validarComplexidadeSenha("SemEspecial123").valida, false);

  assert.equal(validarComplexidadeSenha("NovaSenha@2026").valida, true);
  assert.equal(validarComplexidadeSenha("Senha#Forte.99").valida, true);
});

test("rejeita requisições com dados ou senhas que não atendem aos critérios", async (t) => {
  if (!bancoDisponivel) {
    t.skip("PostgreSQL indisponível para teste de integração.");
    return;
  }

  // Sem token
  const semToken = await redefinirSenhaRoute(
    criarRequisicaoPost({ password: "NovaSenha@2026" }),
  );
  assert.equal(semToken.status, 400);

  // Senha fraca
  const senhaFraca = await redefinirSenhaRoute(
    criarRequisicaoPost({
      token: crypto.randomBytes(32).toString("hex"),
      password: "123",
    }),
  );
  assert.equal(senhaFraca.status, 400);
  const erroSenha = await senhaFraca.json();
  assert.match(erroSenha.error, /mínimo 8 caracteres/);

  // Senha sem caractere especial
  const semEspecial = await redefinirSenhaRoute(
    criarRequisicaoPost({
      token: crypto.randomBytes(32).toString("hex"),
      password: "SenhaSemEspecial1",
    }),
  );
  assert.equal(semEspecial.status, 400);
});

test("rejeita tokens com formato inválido antes de consultar o banco", async () => {
  const formatsInvalidos = ["curto", "x".repeat(64), "G".repeat(64), "a".repeat(65)];

  for (const token of formatsInvalidos) {
    const get = await validarTokenRoute(criarRequisicaoGet(token));
    assert.equal(get.status, 400);
    assert.equal((await get.json()).valid, false);

    const post = await redefinirSenhaRoute(
      criarRequisicaoPost({ token, password: "NovaSenha@2026" }),
    );
    assert.equal(post.status, 400);
  }

  const getSemToken = await validarTokenRoute(criarRequisicaoGet());
  assert.equal(getSemToken.status, 400);
});

test("rejeita tokens inexistentes, expirados ou já consumidos", async (t) => {
  if (!bancoDisponivel) {
    t.skip("PostgreSQL indisponível para teste de integração.");
    return;
  }

  const email = `usuario-token-${crypto.randomUUID()}@luz.example`;
  const senhaHash = await gerarSenhaHash("AntigaSenha@2026");
  const usuario = await prisma.usuario.create({
    data: {
      nome: "Usuario Teste Token",
      email,
      senhaHash,
      perfil: "administrador",
    },
  });

  // Token inexistente
  const inexistente = await redefinirSenhaRoute(
    criarRequisicaoPost({
      token: crypto.randomBytes(32).toString("hex"),
      password: "NovaSenha@2026",
    }),
  );
  assert.equal(inexistente.status, 400);

  // Token expirado
  const tokenExpiradoBruto = crypto.randomBytes(32).toString("hex");
  const agora = new Date();
  const criadoPassado = new Date(agora.getTime() - 20 * 60 * 1000);
  const expiraPassado = new Date(agora.getTime() - 5 * 60 * 1000);

  await prisma.$executeRaw`
    INSERT INTO tokens_recuperacao (usuario_id, token_hash, criado_em, expira_em)
    VALUES (${usuario.id}::uuid, ${sha256(tokenExpiradoBruto)}, ${criadoPassado}, ${expiraPassado})
  `;

  const expiradoRes = await redefinirSenhaRoute(
    criarRequisicaoPost({
      token: tokenExpiradoBruto,
      password: "NovaSenha@2026",
    }),
  );
  assert.equal(expiradoRes.status, 400);
  const erroExpirado = await expiradoRes.json();
  assert.match(erroExpirado.error, /expirado/i);

  // Token já consumido
  const tokenConsumidoBruto = crypto.randomBytes(32).toString("hex");
  await prisma.tokenRecuperacao.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: sha256(tokenConsumidoBruto),
      criadoEm: agora,
      expiraEm: new Date(agora.getTime() + 15 * 60 * 1000),
      consumidoEm: agora,
    },
  });

  const consumidoRes = await redefinirSenhaRoute(
    criarRequisicaoPost({
      token: tokenConsumidoBruto,
      password: "NovaSenha@2026",
    }),
  );
  assert.equal(consumidoRes.status, 400);
  const erroConsumido = await consumidoRes.json();
  assert.match(erroConsumido.error, /já utilizado/i);
});

test("altera senha atomicamente, consome token, invalida sessões e registra auditoria", async (t) => {
  if (!bancoDisponivel) {
    t.skip("PostgreSQL indisponível para teste de integração.");
    return;
  }

  const email = `usuario-sucesso-${crypto.randomUUID()}@luz.example`;
  const senhaAntiga = "SenhaAntiga@2026";
  const senhaNova = "NovaSenhaSegura@2026";
  const senhaHash = await gerarSenhaHash(senhaAntiga);

  const usuario = await prisma.usuario.create({
    data: {
      nome: "Usuario Sucesso Redefinicao",
      email,
      senhaHash,
      perfil: "operador_captacao",
      versao: 1,
    },
  });

  // Cria 2 sessões ativas prévias
  const sessao1 = await prisma.sessao.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: sha256("token-sessao-1"),
      expiraEm: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  const sessao2 = await prisma.sessao.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: sha256("token-sessao-2"),
      expiraEm: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  // Cria token de recuperação válido
  const tokenBruto = crypto.randomBytes(32).toString("hex");
  const agora = new Date();
  const tokenRegistro = await prisma.tokenRecuperacao.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: sha256(tokenBruto),
      criadoEm: agora,
      expiraEm: new Date(agora.getTime() + 15 * 60 * 1000),
    },
  });

  // GET deve indicar token válido
  const getValido = await validarTokenRoute(criarRequisicaoGet(tokenBruto));
  assert.equal(getValido.status, 200);
  assert.equal((await getValido.json()).valid, true);

  // Executa redefinição de senha
  const resposta = await redefinirSenhaRoute(
    criarRequisicaoPost({
      token: tokenBruto,
      password: senhaNova,
    }),
  );
  assert.equal(resposta.status, 200);
  const resultadoJson = await resposta.json();
  assert.match(resultadoJson.message, /sucesso/i);

  // 1. Token deve estar consumido imediatamente
  const tokenAtualizado = await prisma.tokenRecuperacao.findUnique({
    where: { id: tokenRegistro.id },
  });
  assert.ok(tokenAtualizado?.consumidoEm instanceof Date);

  // 2. Token consumido não pode ser reutilizado
  const reuso = await redefinirSenhaRoute(
    criarRequisicaoPost({
      token: tokenBruto,
      password: "OutraSenhaValida@2026",
    }),
  );
  assert.equal(reuso.status, 400);

  // 3. GET após consumo deve indicar token inválido
  const getInvalido = await validarTokenRoute(criarRequisicaoGet(tokenBruto));
  assert.equal(getInvalido.status, 400);

  // 4. Usuário deve ter senha nova e versão incrementada
  const usuarioAtualizado = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuario.id },
  });
  assert.equal(usuarioAtualizado.versao, 2);
  assert.ok(await argon2.verify(usuarioAtualizado.senhaHash, senhaNova));
  assert.equal(await argon2.verify(usuarioAtualizado.senhaHash, senhaAntiga), false);

  // 5. Todas as sessões anteriores devem estar revogadas
  const sessoesAtivas = await prisma.sessao.findMany({
    where: { usuarioId: usuario.id, revogadaEm: null },
  });
  assert.equal(sessoesAtivas.length, 0);

  const sessoesRevogadas = await prisma.sessao.findMany({
    where: { id: { in: [sessao1.id, sessao2.id] } },
  });
  assert.equal(sessoesRevogadas.length, 2);
  assert.ok(sessoesRevogadas[0].revogadaEm instanceof Date);
  assert.ok(sessoesRevogadas[1].revogadaEm instanceof Date);

  // 6. Auditoria registrada
  const eventoAuditoria = await prisma.eventoAuditoria.findFirst({
    where: {
      atorId: usuario.id,
      acao: "Senha redefinida",
      entidadeTipo: "Autenticação",
    },
    orderBy: { criadoEm: "desc" },
  });
  assert.ok(eventoAuditoria);
  assert.equal(eventoAuditoria?.atorTipo, "usuario");
});

test("consome o token apenas uma vez mesmo com requisições concorrentes", async (t) => {
  if (!bancoDisponivel) {
    t.skip("PostgreSQL indisponível para teste de integração.");
    return;
  }

  const email = `usuario-concorrente-${crypto.randomUUID()}@luz.example`;
  const usuario = await prisma.usuario.create({
    data: {
      nome: "Usuario Concorrencia Redefinicao",
      email,
      senhaHash: await gerarSenhaHash("SenhaAntiga@2026"),
      perfil: "administrador",
    },
  });

  const tokenBruto = crypto.randomBytes(32).toString("hex");
  await prisma.tokenRecuperacao.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: sha256(tokenBruto),
      criadoEm: new Date(),
      expiraEm: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  const respostas = await Promise.all([
    redefinirSenhaRoute(
      criarRequisicaoPost({
        token: tokenBruto,
        password: "PrimeiraSenha@2026",
      }),
    ),
    redefinirSenhaRoute(
      criarRequisicaoPost({
        token: tokenBruto,
        password: "SegundaSenha@2026",
      }),
    ),
  ]);

  assert.deepEqual(
    respostas.map((resposta) => resposta.status).sort(),
    [200, 400],
  );

  const tokenAtualizado = await prisma.tokenRecuperacao.findUniqueOrThrow({
    where: { tokenHash: sha256(tokenBruto) },
  });
  assert.ok(tokenAtualizado.consumidoEm instanceof Date);

  const usuarioAtualizado = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuario.id },
  });
  assert.equal(usuarioAtualizado.versao, 2);
});
