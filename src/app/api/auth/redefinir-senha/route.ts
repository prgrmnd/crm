import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import argon2 from "argon2";
import { getPrismaClient } from "@/lib/prisma.ts";
import { recordAuditEvent } from "@/lib/audit-service.ts";

const TOKEN_SHA256 = /^[0-9a-f]{64}$/;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function databasePhcHash(hash: string): string {
  const normalized = hash.replace(
    /\$m=(\d+),p=(\d+),t=(\d+)\$/,
    (_, memory, parallelism, time) =>
      `$m=${memory},t=${time},p=${parallelism}$`,
  );
  if (
    !/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{16,}$/.test(
      normalized,
    )
  ) {
    throw new Error("O formato Argon2id gerado não atende ao esquema do banco.");
  }
  return normalized;
}

export function validarComplexidadeSenha(senha: unknown): {
  valida: boolean;
  erro?: string;
} {
  if (typeof senha !== "string") {
    return { valida: false, erro: "Senha é obrigatória." };
  }
  if (senha.length < 8) {
    return {
      valida: false,
      erro: "A senha deve conter no mínimo 8 caracteres.",
    };
  }
  if (senha.length > 1024) {
    return {
      valida: false,
      erro: "A senha não deve ultrapassar 1024 caracteres.",
    };
  }
  const temMinuscula = /[a-z]/.test(senha);
  const temMaiuscula = /[A-Z]/.test(senha);
  const temNumero = /[0-9]/.test(senha);
  const temEspecial = /[^A-Za-z0-9]/.test(senha);

  if (!temMinuscula || !temMaiuscula || !temNumero || !temEspecial) {
    return {
      valida: false,
      erro: "A senha deve conter ao menos uma letra maiúscula, uma minúscula, um número e um caractere especial.",
    };
  }

  return { valida: true };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token || !TOKEN_SHA256.test(token)) {
    return NextResponse.json(
      { valid: false, error: "Token de recuperação inválido." },
      { status: 400 },
    );
  }

  try {
    const prisma = getPrismaClient();
    const tokenHash = sha256(token);
    const agora = new Date();

    const registro = await prisma.tokenRecuperacao.findUnique({
      where: { tokenHash },
      include: { usuario: true },
    });

    if (
      !registro ||
      registro.consumidoEm !== null ||
      registro.invalidadoEm !== null ||
      registro.expiraEm <= agora ||
      !registro.usuario.ativo
    ) {
      return NextResponse.json(
        { valid: false, error: "Token inválido, expirado ou já utilizado." },
        { status: 400 },
      );
    }

    return NextResponse.json({ valid: true }, { status: 200 });
  } catch (error) {
    console.error("Erro ao validar token de recuperação:", error);
    return NextResponse.json(
      { valid: false, error: "Erro interno no servidor." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const payload = corpo as {
    token?: unknown;
    password?: unknown;
    novaSenha?: unknown;
  } | null;

  const tokenBruto = payload?.token;
  if (typeof tokenBruto !== "string" || !tokenBruto.trim()) {
    return NextResponse.json(
      { error: "Token de recuperação é obrigatório." },
      { status: 400 },
    );
  }

  const token = tokenBruto.trim();
  if (!TOKEN_SHA256.test(token)) {
    return NextResponse.json(
      { error: "Token de recuperação inválido." },
      { status: 400 },
    );
  }

  const senha = payload?.password ?? payload?.novaSenha;
  const validacao = validarComplexidadeSenha(senha);
  if (!validacao.valida) {
    return NextResponse.json({ error: validacao.erro }, { status: 400 });
  }
  const novaSenha = senha as string;

  try {
    const prisma = getPrismaClient();
    const tokenHash = sha256(token);
    const correlationId = crypto.randomUUID();

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Bloqueia a linha para impedir que duas requisições consumam o mesmo token
      await tx.$queryRaw`
        SELECT id FROM tokens_recuperacao WHERE token_hash = ${tokenHash} FOR UPDATE
      `;

      // O prazo é avaliado depois do bloqueio: um token que expira enquanto
      // aguarda a transação não pode ser consumido com um timestamp obsoleto.
      const agora = new Date();

      const tokenRecord = await tx.tokenRecuperacao.findUnique({
        where: { tokenHash },
        include: { usuario: true },
      });

      // 2. Rejeição imediata se inexistente, consumido, invalidado ou expirado
      if (!tokenRecord) {
        return {
          sucesso: false,
          status: 400,
          erro: "Token de recuperação inválido ou inexistente.",
        };
      }

      if (tokenRecord.consumidoEm !== null || tokenRecord.invalidadoEm !== null) {
        return {
          sucesso: false,
          status: 400,
          erro: "Token de recuperação já utilizado ou cancelado.",
        };
      }

      if (tokenRecord.expiraEm <= agora) {
        return {
          sucesso: false,
          status: 400,
          erro: "Token de recuperação expirado. Solicite um novo link.",
        };
      }

      // Mensagem idêntica à de token inexistente: não revela se a conta existe.
      if (!tokenRecord.usuario || !tokenRecord.usuario.ativo) {
        return {
          sucesso: false,
          status: 400,
          erro: "Token de recuperação inválido ou inexistente.",
        };
      }

      // 3. Consumo imediato do token
      await tx.tokenRecuperacao.update({
        where: { id: tokenRecord.id },
        data: { consumidoEm: agora },
      });

      // 4. Hash seguro Argon2id formatado para o PostgreSQL
      const hashGerado = await argon2.hash(novaSenha, {
        type: argon2.argon2id,
      });
      const senhaHash = databasePhcHash(hashGerado);

      // 5. Atualização atômica da senha e controle de versão
      await tx.usuario.update({
        where: { id: tokenRecord.usuarioId },
        data: {
          senhaHash,
          senhaAlteradaEm: agora,
          versao: { increment: 1 },
        },
      });

      // 6. Invalidação automática de todas as sessões ativas prévias
      await tx.sessao.updateMany({
        where: {
          usuarioId: tokenRecord.usuarioId,
          revogadaEm: null,
        },
        data: {
          revogadaEm: agora,
        },
      });

      // 7. Registro na auditoria
      await recordAuditEvent(
        {
          actorType: "usuario",
          actorId: tokenRecord.usuarioId,
          action: "Senha redefinida",
          entityType: "Autenticação",
          entityId: tokenRecord.usuarioId,
          correlationId,
          after: { resultado: "sucesso" },
        },
        tx,
      );

      return { sucesso: true, status: 200 };
    });

    if (!resultado.sucesso) {
      return NextResponse.json(
        { error: resultado.erro },
        { status: resultado.status },
      );
    }

    return NextResponse.json(
      { message: "Senha redefinida com sucesso." },
      { status: 200 },
    );
  } catch (error) {
    console.error("Erro na redefinição de senha:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao redefinir a senha." },
      { status: 500 },
    );
  }
}
