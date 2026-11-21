import { NextRequest, NextResponse } from "next/server";
import { getActiveSession, SESSION_COOKIE } from "@/lib/auth-service.ts";
import { getPrismaClient } from "@/lib/prisma.ts";

export async function GET(request: NextRequest) {
  let authenticatedUser;
  try {
    authenticatedUser = await getActiveSession(
      request.cookies.get(SESSION_COOKIE)?.value,
      true,
    );
  } catch (error) {
    console.error("Falha ao validar sessão na listagem de operadores.", error);
    return NextResponse.json(
      { error: "Não foi possível validar sua sessão." },
      { status: 500 },
    );
  }

  if (!authenticatedUser) {
    return NextResponse.json(
      { error: "Sua sessão expirou. Entre novamente." },
      { status: 401 },
    );
  }

  try {
    const prisma = getPrismaClient();
    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get("ativo") !== "false";

    const rows = await prisma.usuario.findMany({
      where: onlyActive ? { ativo: true } : undefined,
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
      },
    });

    const users = rows.map((u) => ({
      id: u.id,
      name: u.nome,
      email: u.email,
      profile: u.perfil,
      role:
        u.perfil === "administrador"
          ? "Administrador"
          : "Operador de Captação",
      active: u.ativo,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Falha ao consultar usuários no PostgreSQL.", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os operadores." },
      { status: 500 },
    );
  }
}
