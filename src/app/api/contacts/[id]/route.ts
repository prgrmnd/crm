import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client.ts";
import { getActiveSession, SESSION_COOKIE } from "@/lib/auth-service.ts";
import { withIdempotency } from "@/lib/idempotency-service.ts";
import { getPrismaClient } from "@/lib/prisma.ts";
import {
  ContactServiceError,
  createResponseInDatabase,
  getContact360FromDatabase,
  softDeleteContactInDatabase,
  STRICT_UUID_REGEX,
  updateContactInDatabase,
  type ContactMutationInput,
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
    console.error("Falha ao validar sessão ao consultar ficha 360°.", error);
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
    const contact = await getContact360FromDatabase(prisma, id);
    if (!contact) {
      return NextResponse.json(
        { error: "Contato não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json({ contact });
  } catch (error) {
    console.error("Falha ao carregar ficha 360° do contato.", error);
    return NextResponse.json(
      { error: "Não foi possível carregar a ficha do contato." },
      { status: 500 },
    );
  }
}

export async function PATCH(
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
    console.error("Falha ao validar sessão ao atualizar contato.", error);
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

  let body: ContactMutationInput;
  try {
    body = (await request.json()) as ContactMutationInput;
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
    const contact = await prisma.$transaction((tx) =>
      updateContactInDatabase(tx, authenticatedUser, id, body, correlationId),
    );
    return NextResponse.json(
      { contact, correlationId },
      { headers: { "x-correlation-id": correlationId } },
    );
  } catch (error) {
    if (error instanceof ContactServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { "x-correlation-id": correlationId } },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Já existe um contato com este e-mail ou CPF/CNPJ." },
        { status: 409, headers: { "x-correlation-id": correlationId } },
      );
    }
    console.error("Falha ao atualizar contato no PostgreSQL.", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o contato." },
      { status: 500, headers: { "x-correlation-id": correlationId } },
    );
  }
}

/**
 * POST /api/contacts/[id]
 * Compatibilidade segura para ações de opt-out autenticadas;
 * o endpoint canônico para respostas/opt-out é POST /api/contacts/[id]/respostas.
 */
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
    console.error("Falha ao validar sessão para registrar opt-out.", error);
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

  let body: Record<string, unknown>;
  try {
    body = (await request.clone().json()) as Record<string, unknown>;
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

  if (
    body.action !== "optOut" &&
    body.action !== "unsubscribe" &&
    !body.optOut
  ) {
    return NextResponse.json(
      { error: "Ação não suportada." },
      { status: 400 },
    );
  }

  const correlationId = resolveCorrelationId(request);
  const prisma = getPrismaClient();
  const payload: ResponseInput = {
    classificacao: "descadastro",
    conteudo: body.conteudo ?? body.motivo ?? body.reason ?? body.observacao,
  };

  try {
    return await withIdempotency(
      request,
      {
        userId: authenticatedUser.id,
        operation: `POST:/api/contacts/${id}:optOut`,
      },
      async (transaction) => {
        try {
          const execute = (tx: Prisma.TransactionClient) =>
            createResponseInDatabase(
              tx,
              authenticatedUser,
              id,
              payload,
              correlationId,
            );
          const result = transaction
            ? await execute(transaction)
            : await prisma.$transaction(execute);

          return NextResponse.json(
            {
              success: true,
              ...result,
              correlationId,
            },
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
    console.error("Falha ao processar opt-out no PostgreSQL.", error);
    return NextResponse.json(
      { error: "Erro interno ao processar opt-out." },
      { status: 500, headers: { "x-correlation-id": correlationId } },
    );
  }
}

export async function DELETE(
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
    console.error("Falha ao validar a sessão para excluir contato.", error);
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

  const correlationId = resolveCorrelationId(request);

  if (authenticatedUser.profile !== "administrador") {
    return NextResponse.json(
      { error: "Esta ação exige perfil de Administrador." },
      { status: 403, headers: { "x-correlation-id": correlationId } },
    );
  }

  const prisma = getPrismaClient();

  try {
    return await withIdempotency(
      request,
      {
        userId: authenticatedUser.id,
        operation: `DELETE:/api/contacts/${id}`,
      },
      async (transaction) => {
        try {
          const execute = (tx: Prisma.TransactionClient) =>
            softDeleteContactInDatabase(
              tx,
              authenticatedUser,
              id,
              correlationId,
            );
          const deleted = transaction
            ? await execute(transaction)
            : await prisma.$transaction(execute);

          return NextResponse.json(
            {
              success: true,
              allowed: true,
              contact: deleted,
              correlationId,
            },
            { headers: { "x-correlation-id": correlationId } },
          );
        } catch (error) {
          if (error instanceof ContactServiceError) {
            return NextResponse.json(
              {
                allowed: error.status === 409 ? false : undefined,
                error: error.message,
                code: error.code,
              },
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
    console.error("Falha ao excluir contato no PostgreSQL.", error);
    return NextResponse.json(
      { error: "Erro interno ao processar exclusão." },
      { status: 500, headers: { "x-correlation-id": correlationId } },
    );
  }
}
