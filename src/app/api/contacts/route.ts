import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client.ts";
import { getActiveSession, SESSION_COOKIE } from "@/lib/auth-service.ts";
import { getPrismaClient } from "@/lib/prisma.ts";
import { withIdempotency } from "@/lib/idempotency-service.ts";
import {
  ContactServiceError,
  createContactInDatabase,
  exportContactsToCSV,
  filterContactsList,
  paginateContacts,
  queryAllContactsFromDatabase,
  queryContactsFromDatabase,
  STRICT_UUID_REGEX,
  type ContactMutationInput,
  type ContactQueryParams,
} from "@/lib/contact-service.ts";
import type { Contact, Payment } from "@/types/crm.ts";
import D from "@/lib/domain.cjs";
import seedFixture from "../../../../tests/fixtures/seed.cjs";

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveCorrelationId(request: NextRequest): string {
  const requested = request.headers?.get?.("x-correlation-id");
  return requested && STRICT_UUID_REGEX.test(requested)
    ? requested
    : randomUUID();
}

export async function GET(request: NextRequest) {
  let authenticatedUser;
  try {
    authenticatedUser = await getActiveSession(
      request.cookies.get(SESSION_COOKIE)?.value,
      true,
    );
  } catch (error) {
    console.error("Falha ao validar a sessão na listagem de contatos.", error);
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

  const { searchParams } = new URL(request.url);
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(
    searchParams.get("pageSize") || searchParams.get("limit"),
    10,
  );
  const tab = searchParams.get("tab") || searchParams.get("category") || "all";
  const q = searchParams.get("q") || "";
  const origin = searchParams.get("origin") || "";
  const owner = searchParams.get("owner") || "";
  const period = searchParams.get("period") || "";
  const funnel = searchParams.get("funnel") || "";
  const status = searchParams.get("status") || "";
  const stage = searchParams.get("stage") || "";
  const idsParam = searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;
  const isExport =
    searchParams.get("export") === "csv" ||
    searchParams.get("export") === "true";

  const queryParams: ContactQueryParams = {
    page,
    pageSize,
    tab,
    q,
    origin,
    owner,
    period,
    funnel,
    status,
    stage,
    ids,
  };

  // Quando DATABASE_URL está configurada, PostgreSQL é a única fonte de verdade
  // para contatos/potenciais (inclusive quando a tabela estiver vazia — empty state real).
  // Apenas a aba "donors" mantém fallback de demonstração até a entrega de PB-060/PB-061.
  const isDonorsTab = tab === "donors" || tab === "Doadores";
  if (process.env.DATABASE_URL && !isDonorsTab) {
    try {
      const prisma = getPrismaClient();
      if (isExport) {
        const contacts = await queryAllContactsFromDatabase(
          prisma,
          queryParams,
        );
        const csv = exportContactsToCSV(contacts);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="relacionamentos-luz.csv"',
          },
        });
      }
      const result = await queryContactsFromDatabase(prisma, queryParams);
      return NextResponse.json(result);
    } catch (dbError) {
      console.error("Falha ao consultar contatos no PostgreSQL.", dbError);
      return NextResponse.json(
        { error: "Não foi possível carregar os contatos do servidor." },
        { status: 500 },
      );
    }
  }

  // Fallback para massa de demonstração (somente sem DATABASE_URL ou na aba Doadores)
  const seedState = (seedFixture as any).seed
    ? (seedFixture as any).seed()
    : (D as any).createEmptyState();
  const allContacts: Contact[] = seedState.contacts || [];
  const payments: Payment[] = seedState.payments || [];

  const filtered = filterContactsList(allContacts, queryParams, payments);

  if (isExport) {
    const csv = exportContactsToCSV(filtered, payments);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="relacionamentos-luz.csv"',
      },
    });
  }

  const paginated = paginateContacts(filtered, page, pageSize);
  return NextResponse.json(paginated);
}

export async function POST(request: NextRequest) {
  let authenticatedUser;
  try {
    authenticatedUser = await getActiveSession(
      request.cookies.get(SESSION_COOKIE)?.value,
      true,
    );
  } catch (error) {
    console.error("Falha ao validar a sessão ao cadastrar contato.", error);
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
    body = (await request.clone().json()) as ContactMutationInput;
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
        operation: "POST:/api/contacts",
      },
      async (transaction) => {
        try {
          const execute = (tx: Prisma.TransactionClient) =>
            createContactInDatabase(tx, authenticatedUser, body, correlationId);
          const contact = transaction
            ? await execute(transaction)
            : await prisma.$transaction(execute);

          return NextResponse.json(
            { contact, correlationId },
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Já existe um contato com este e-mail ou CPF/CNPJ." },
        { status: 409, headers: { "x-correlation-id": correlationId } },
      );
    }
    console.error("Falha ao cadastrar contato no PostgreSQL.", error);
    return NextResponse.json(
      { error: "Não foi possível salvar o contato." },
      { status: 500, headers: { "x-correlation-id": correlationId } },
    );
  }
}
