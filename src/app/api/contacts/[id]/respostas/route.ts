import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client.ts";
import { getActiveSession, SESSION_COOKIE } from "@/lib/auth-service.ts";
import { withIdempotency } from "@/lib/idempotency-service.ts";
import { getPrismaClient } from "@/lib/prisma.ts";
import {
  ContactServiceError,
  createResponseInDatabase,
  isValidUuid,
  STRICT_UUID_REGEX,
  type ResponseInput,
} from "@/lib/contact-service.ts";

function resolveCorrelationId(request: NextRequest): string {
  const requested = request.headers?.get?.("x-correlation-id");
  return requested && STRICT_UUID_REGEX.test(requested)
    ? requested
    : randomUUID();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let authenticatedUser;
  try {
    authenticatedUser = await getActiveSession(
      request.cookies.get(SESSION_COOKIE)?.value,
      true,
    );
  } catch (error) {
    console.error("Falha ao validar sessão ao listar respostas.", error);
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

  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: "Contato não encontrado." },
      { status: 404 },
    );
  }

  try {
    const prisma = getPrismaClient();
    const contact = await prisma.contato.findFirst({
      where: { id, excluidoEm: null },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json(
        { error: "Contato não encontrado." },
        { status: 404 },
      );
    }

    const rows = await prisma.respostaContato.findMany({
      where: { contatoId: id },
      include: { autor: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: "desc" },
    });

    return NextResponse.json({
      responses: rows.map((r) => ({
        id: r.id,
        contatoId: r.contatoId,
        classificacao: r.classificacao,
        conteudo: r.conteudo,
        criadoEm: r.criadoEm.toISOString(),
        autorId: r.autorId,
        autorNome: r.autor?.nome || "—",
      })),
    });
  } catch (error) {
    console.error("Falha ao listar respostas no PostgreSQL.", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as respostas." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let authenticatedUser;
  try {
    authenticatedUser = await getActiveSession(
      request.cookies.get(SESSION_COOKIE)?.value,
      true,
    );
  } catch (error) {
    console.error("Falha ao validar sessão ao registrar resposta.", error);
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

  let body: ResponseInput;
  try {
    body = (await request.clone().json()) as ResponseInput;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Requisição inválida." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400 },
    );
  }

  const correlationId = resolveCorrelationId(request);
  const prisma = getPrismaClient();

  try {
    return await withIdempotency(
      request,
      {
        userId: authenticatedUser.id,
        operation: `POST:/api/contacts/${id}/respostas`,
      },
      async (transaction) => {
        try {
          const execute = (tx: Prisma.TransactionClient) =>
            createResponseInDatabase(
              tx,
              authenticatedUser,
              id,
              body,
              correlationId,
            );
          const result = transaction
            ? await execute(transaction)
            : await prisma.$transaction(execute);

          return NextResponse.json(
            { ...result, correlationId },
            {
              status: 201,
              headers: { "x-correlation-id": correlationId },
            },
          );
        } catch (error) {
          if (error instanceof ContactServiceError) {
            return NextResponse.json(
              { error: error.message, code: error.code },
              {
                status: error.status,
                headers: { "x-correlation-id": correlationId },
              },
            );
          }
          throw error;
        }
      },
      prisma,
    );
  } catch (error) {
    console.error("Falha ao registrar resposta no PostgreSQL.", error);
    return NextResponse.json(
      { error: "Não foi possível registrar a resposta." },
      { status: 500, headers: { "x-correlation-id": correlationId } },
    );
  }
}
