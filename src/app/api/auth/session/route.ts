import { NextRequest, NextResponse } from "next/server";
import {
  getActiveSession,
  SESSION_COOKIE,
  SESSION_IDLE_LIMIT_MS,
} from "@/lib/auth-service.ts";

function unauthorized() {
  const response = NextResponse.json(
    { error: "Sua sessão expirou. Entre novamente." },
    { status: 401 },
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

export async function GET(request: NextRequest) {
  try {
    const user = await getActiveSession(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    return user ? NextResponse.json({ user }) : unauthorized();
  } catch (error) {
    console.error("Falha ao validar sessão.", error);
    return NextResponse.json(
      { error: "Não foi possível validar sua sessão." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return unauthorized();
    const user = await getActiveSession(token, true);
    if (!user) return unauthorized();

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_IDLE_LIMIT_MS / 1000),
    });
    return response;
  } catch (error) {
    console.error("Falha ao renovar sessão.", error);
    return NextResponse.json(
      { error: "Não foi possível renovar sua sessão." },
      { status: 500 },
    );
  }
}
