import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getPrismaClient } from "@/lib/prisma.ts";
import { permitirTentativa } from "@/lib/rate-limit.ts";

const MENSAGEM_NEUTRA = "Se o e-mail estiver cadastrado, você receberá as instruções.";
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TTL_TOKEN_MS = 15 * 60 * 1000;

function obterIp(request: NextRequest): string {
  const encaminhado = request.headers.get("x-forwarded-for");
  return encaminhado?.split(",")[0].trim() || "127.0.0.1";
}

export async function POST(request: NextRequest) {
  // 1. Valida o payload ANTES de gastar cota do rate limit
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const emailBruto = (corpo as { email?: unknown } | null)?.email;
  if (typeof emailBruto !== "string") {
    return NextResponse.json({ error: "E-mail obrigatório" }, { status: 400 });
  }

  const email = emailBruto.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_VALIDO.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }

  // 2. Rate limit por IP e por e-mail normalizado
  if (!permitirTentativa(obterIp(request), email)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde." }, { status: 429 });
  }

  try {
    const prisma = getPrismaClient();

    // 3. Só usuários ativos
    const usuario = await prisma.usuario.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        ativo: true,
      },
    });

    if (usuario) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const agora = new Date();
      const expiracao = new Date(agora.getTime() + TTL_TOKEN_MS);

      // 4. Invalida só os tokens pendentes e cria o novo, na mesma transação
      await prisma.$transaction([
        prisma.tokenRecuperacao.updateMany({
          where: {
            usuarioId: usuario.id,
            consumidoEm: null,
            invalidadoEm: null,
          },
          data: { invalidadoEm: agora },
        }),
        prisma.tokenRecuperacao.create({
          data: {
            usuarioId: usuario.id,
            tokenHash,
            criadoEm: agora,
            expiraEm: expiracao,
          },
        }),
      ]);

      // Simulação do envio de e-mail. A WBS 1.2 proíbe token em logs de produção,
      // por isso só aparece em desenvolvimento.
      if (process.env.NODE_ENV === "development") {
        console.log(`[DEV E-MAIL] Recuperação para: ${email} | Token (link): ${token}`);
      }
    }

    // 5. Resposta idêntica exista a conta ou não
    return NextResponse.json({ message: MENSAGEM_NEUTRA }, { status: 200 });
  } catch (error) {
    console.error("Erro na recuperação de senha:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
