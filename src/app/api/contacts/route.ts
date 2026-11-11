import { NextRequest, NextResponse } from "next/server";
import { getActiveSession, SESSION_COOKIE } from "@/lib/auth-service.ts";
import { getPrismaClient } from "@/lib/prisma.ts";
import {
  exportContactsToCSV,
  filterContactsList,
  paginateContacts,
  queryAllContactsFromDatabase,
  queryContactsFromDatabase,
  type ContactQueryParams,
} from "@/lib/contact-service.ts";
import type { Contact, Payment } from "@/types/crm.ts";
import D from "@/lib/domain.cjs";
import seedFixture from "../../../../tests/fixtures/seed.cjs";

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

  // Try querying PostgreSQL with Prisma first
  if (process.env.DATABASE_URL) {
    try {
      const prisma = getPrismaClient();
      const countTotal = await prisma.contato.count({
        where: { excluidoEm: null },
      });
      if (countTotal > 0 && !["donors", "Doadores"].includes(tab)) {
        if (isExport) {
          // Export all filtered records matching active parameters
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
      }
    } catch (dbError) {
      console.warn(
        "Consulta Prisma indisponível, usando fallback em memória.",
        dbError,
      );
    }
  }

  // Fallback to domain seed data for demo / in-memory compatibility
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
