import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPrismaClient } from "@/lib/prisma";

const prisma = getPrismaClient();
const rateLimit = new Map();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const now = Date.now();

  if (rateLimit.has(ip) && now - rateLimit.get(ip) < 60000) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde." }, { status: 429 });
  }
  rateLimit.set(ip, now);

  try {
    const body = await request.json();
    const email = body.email?.toLowerCase().trim();

    if (!email) {
      return NextResponse.json({ error: "E-mail obrigatório" }, { status: 400 });
    }

    const usuario = await prisma.usuario.findFirst({ where: { email } });

    if (usuario) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiracao = new Date(Date.now() + 15 * 60 * 1000);

      await prisma.tokenRecuperacao.updateMany({
        where: { usuarioId: usuario.id },
        data: { invalidadoEm: new Date() }
      });

     await prisma.tokenRecuperacao.create({
  data: {
    tokenHash: tokenHash,
    usuarioId: usuario.id,
    expiraEm: expiracao
  }
});

      console.log(`[BACKEND E-MAIL] Recuperação para: ${email} | Token (Link): ${token}`);
    }

    return NextResponse.json(
      { message: "Se o e-mail estiver cadastrado, você receberá as instruções." },
      { status: 200 }
    );

} catch (error) {
    console.error("ERRO DETALHADO:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}