import { NextRequest, NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth-service.ts";

export async function POST(request: NextRequest) {
  try {
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
  } catch (error) {
    console.error("Falha ao revogar sessão.", error);
    const response = NextResponse.json(
      { error: "Não foi possível encerrar sua sessão no servidor." },
      { status: 500 },
    );
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
