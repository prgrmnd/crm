import { NextRequest, NextResponse } from "next/server";
import { canDeleteContact, deleteContact } from "@/lib/contact-service.ts";
import { recordAuditEvent } from "@/lib/audit-service.ts";
import type { CRMState, User } from "@/types/crm.ts";
import { randomUUID } from "node:crypto";

/**
 * DELETE /api/contacts/[id]
 *
 * Backend endpoint para exclusão segura de contatos no monólito Next.js.
 * Garante a trava mandatória de integridade financeira no lado do servidor.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const requestedCorrelationId = request.headers?.get?.("x-correlation-id");
  const correlationId =
    requestedCorrelationId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestedCorrelationId,
    )
      ? requestedCorrelationId
      : randomUUID();
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const state: CRMState = body.state;
    const user: User = body.user;

    if (!state || !user) {
      return NextResponse.json(
        { error: "Estado ou usuário não fornecido." },
        { status: 400 },
      );
    }

    // Trava mandatória de integridade no backend
    const check = canDeleteContact(state, id);
    if (!check.allowed) {
      return NextResponse.json(
        {
          allowed: false,
          error: check.reason,
        },
        { status: 409 }, // 409 Conflict: violação de regra de negócio/integridade
      );
    }

    const original = state.contacts.find((contact) => contact.id === id);
    const deleted = deleteContact(state, user, id);
    await recordAuditEvent({
      actorType: "usuario",
      actorId: user.id,
      contactId: id,
      action: "Contato excluído",
      entityType: "Contato",
      entityId: id,
      correlationId,
      before: original ?? null,
    });
    return NextResponse.json({
      success: true,
      allowed: true,
      contact: deleted,
      state,
      correlationId,
    }, { headers: { "x-correlation-id": correlationId } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro interno ao processar exclusão." },
      {
        status: error.message?.includes("Administrador") ? 403 : 500,
        headers: { "x-correlation-id": correlationId },
      },
    );
  }
}
