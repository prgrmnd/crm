import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client.ts";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma.ts";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const RETENTION_MS = 24 * 60 * 60 * 1000;

type TransactionClient = Prisma.TransactionClient;
type Handler = (transaction?: TransactionClient) => Promise<Response>;

interface IdempotencyOptions {
  userId: string;
  operation: string;
}

function cachedResponse(value: Prisma.JsonValue | null): NextResponse {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("status" in value) ||
    typeof value.status !== "number" ||
    !("body" in value)
  ) {
    throw new Error("Resposta armazenada para idempotência está inválida.");
  }

  const headers = new Headers();
  if ("correlationId" in value && typeof value.correlationId === "string") {
    headers.set("x-correlation-id", value.correlationId);
  }

  return NextResponse.json(value.body, {
    status: value.status,
    headers,
  });
}

function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function serializeResponse(response: Response): Promise<{
  status: number;
  body: Prisma.JsonValue;
  correlationId?: string;
}> {
  return response
    .clone()
    .json()
    .then((body: Prisma.JsonValue) => {
      const correlationId = response.headers.get("x-correlation-id");
      return {
        status: response.status,
        body,
        ...(correlationId ? { correlationId } : {}),
      };
    });
}

export async function withIdempotency(
  request: Request,
  options: IdempotencyOptions,
  handler: Handler,
  prisma?: PrismaClient,
): Promise<Response> {
  const key = request.headers?.get?.(IDEMPOTENCY_KEY_HEADER) ?? null;
  if (!key) {
    return handler();
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  ) {
    return NextResponse.json(
      { error: "A chave de idempotência deve ser um UUID válido." },
      { status: 400 },
    );
  }

  const payload = Buffer.from(await request.clone().arrayBuffer());
  const requestHash = createHash("sha256").update(payload).digest("hex");
  const client = prisma ?? getPrismaClient();
  const uniqueKey = {
    usuarioId_operacao_chave: {
      usuarioId: options.userId,
      operacao: options.operation,
      chave: key,
    },
  };

  try {
    return await client.$transaction(async (transaction) => {
      const existing = await transaction.requisicaoIdempotente.findUnique({
        where: uniqueKey,
      });
      const now = new Date();

      if (existing && existing.expiraEm > now) {
        if (existing.hashRequisicao !== requestHash) {
          return conflict(
            "A chave de idempotência já foi usada com outro conteúdo.",
          );
        }
        if (existing.estado === "processando" || !existing.resposta) {
          return NextResponse.json(
            { error: "A requisição ainda está sendo processada." },
            { status: 409, headers: { "retry-after": "1" } },
          );
        }
        return cachedResponse(existing.resposta);
      }

      if (existing) {
        await transaction.requisicaoIdempotente.deleteMany({
          where: { id: existing.id, expiraEm: { lte: now } },
        });
      }

      const record = await transaction.requisicaoIdempotente.create({
        data: {
          usuarioId: options.userId,
          operacao: options.operation,
          chave: key,
          hashRequisicao: requestHash,
          estado: "processando",
          expiraEm: new Date(now.getTime() + RETENTION_MS),
        },
      });
      const response = await handler(transaction);
      const responseData = await serializeResponse(response);

      await transaction.requisicaoIdempotente.update({
        where: { id: record.id },
        data: {
          estado: responseData.status >= 500 ? "falha" : "concluida",
          resposta: JSON.parse(JSON.stringify(responseData)),
        },
      });

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existing = await client.requisicaoIdempotente.findUnique({
      where: uniqueKey,
    });
    if (!existing) {
      throw error;
    }
    if (existing.hashRequisicao !== requestHash) {
      return conflict(
        "A chave de idempotência já foi usada com outro conteúdo.",
      );
    }
    if (existing.estado === "processando" || !existing.resposta) {
      return NextResponse.json(
        { error: "A requisição ainda está sendo processada." },
        { status: 409, headers: { "retry-after": "1" } },
      );
    }
    return cachedResponse(existing.resposta);
  }
}
