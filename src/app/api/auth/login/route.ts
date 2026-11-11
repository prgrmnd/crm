import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  SESSION_COOKIE,
  SESSION_IDLE_LIMIT_MS,
} from "@/lib/auth-service.ts";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("email" in body) ||
    !("password" in body) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.trim().length > 254 ||
    body.password.length === 0 ||
    body.password.length > 1024
  ) {
    return NextResponse.json(
      { error: "Informe e-mail e senha válidos." },
      { status: 400 },
    );
  }

  try {
    const result = await authenticate(
      body.email,
      body.password,
      request.headers,
    );
    if (result.status !== 200 || !result.user || !result.token) {
      const response = NextResponse.json(
        {
          error:
            result.status === 429
              ? "Muitas tentativas de acesso. Aguarde antes de tentar novamente."
              : "E-mail ou senha inválidos.",
        },
        { status: result.status },
      );
      if (result.retryAfter) {
        response.headers.set("retry-after", String(result.retryAfter));
      }
      return response;
    }

    const response = NextResponse.json({ user: result.user });
    response.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_IDLE_LIMIT_MS / 1000),
    });
    return response;
  } catch (error) {
    console.error("Falha ao processar autenticação.", error);
    return NextResponse.json(
      { error: "Não foi possível concluir o login. Tente novamente." },
      { status: 500 },
    );
  }
}
