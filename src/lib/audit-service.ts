import { getPrismaClient } from "@/lib/prisma.ts";
import type { Prisma } from "@/generated/prisma/client.ts";

const sensitiveKey =
  /(senha|password|credential|credencial|token|secret|segredo|salt|hash|authorization|cookie)/i;

type Snapshot = object | null;

export interface AuditEventInput {
  actorType: "usuario" | "sistema";
  actorId?: string | null;
  contactId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  correlationId: string;
  before?: Snapshot;
  after?: Snapshot;
}

function sanitizeSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSnapshot);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested]) =>
        sensitiveKey.test(key) ? [] : [[key, sanitizeSnapshot(nested)]],
      ),
    );
  }
  return value;
}

export async function recordAuditEvent(
  event: AuditEventInput,
  transaction?: Prisma.TransactionClient,
) {
  const before = event.before ? sanitizeSnapshot(event.before) : undefined;
  const after = event.after ? sanitizeSnapshot(event.after) : undefined;

  const client = transaction ?? getPrismaClient();
  return client.eventoAuditoria.create({
    data: {
      atorTipo: event.actorType,
      atorId: event.actorId ?? null,
      contatoId: event.contactId ?? null,
      acao: event.action,
      entidadeTipo: event.entityType,
      entidadeId: event.entityId ?? null,
      motivo: event.reason ?? null,
      correlacaoId: event.correlationId,
      ...(before === undefined ? {} : { antes: before as object }),
      ...(after === undefined ? {} : { depois: after as object }),
    },
  });
}
