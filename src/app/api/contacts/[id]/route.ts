import { NextRequest, NextResponse } from "next/server";
import { canDeleteContact, deleteContact, registerOptOut } from "@/lib/contact-service.ts";
import { recordAuditEvent } from "@/lib/audit-service.ts";
import type { CRMState, User } from "@/types/crm.ts";
import { randomUUID } from "node:crypto";
import { withIdempotency } from "@/lib/idempotency-service.ts";
import { getActiveSession, SESSION_COOKIE } from "@/lib/auth-service.ts";

/**
 * DELETE /api/contacts/[id]
 * POST /api/contacts/[id] (opt-out)
 *
 * Backend endpoint para exclusão segura de contatos no monólito Next.js.
 * Garante a trava mandatória de integridade financeira no lado do servidor.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "optOut" || body.action === "unsubscribe" || body.optOut) {
      const state: CRMState = body.state;
      const user: User = body.user;
      if (!state || !user) {
        return NextResponse.json(
          { error: "Estado ou usuário não fornecido." },
          { status: 400 },
        );
      }
      const rec = registerOptOut(state, user, id, body);
      return NextResponse.json({
        success: true,
        optOut: rec,
        state,
      });
    }
    return NextResponse.json({ error: "Ação não suportada." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro interno ao processar opt-out." },
      { status: 500 },
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

  let body: { state?: CRMState } | null;
  try {
    body = await request.clone().json();
  } catch {
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400 },
    );
  }
  const user: User = {
    id: authenticatedUser.id,
    name: authenticatedUser.name,
    email: authenticatedUser.email,
    role:
      authenticatedUser.profile === "administrador"
        ? "Administrador"
        : "Operador de Captação",
    active: true,
  };

  return withIdempotency(
    request,
    {
      userId: authenticatedUser.id,
      operation: `DELETE:/api/contacts/${id}`,
    },
    async (transaction) => {
      const requestedCorrelationId = request.headers?.get?.("x-correlation-id");
      const correlationId =
        requestedCorrelationId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          requestedCorrelationId,
        )
          ? requestedCorrelationId
          : randomUUID();
      try {
        const state = body?.state;

        if (!state) {
          return NextResponse.json(
            { error: "Estado não fornecido." },
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
            { status: 409 },
          );
        }

        const original = state.contacts.find((contact) => contact.id === id);
        const deleted = deleteContact(state, user, id);
        await recordAuditEvent(
          {
            actorType: "usuario",
            actorId: user.id,
            contactId: id,
            action: "Contato excluído",
            entityType: "Contato",
            entityId: id,
            correlationId,
            before: original ?? null,
          },
          transaction,
        );
        return NextResponse.json(
          {
            success: true,
            allowed: true,
            contact: deleted,
            state,
            correlationId,
          },
          { headers: { "x-correlation-id": correlationId } },
        );
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || "Erro interno ao processar exclusão." },
          {
            status: error.message?.includes("Administrador") ? 403 : 500,
            headers: { "x-correlation-id": correlationId },
          },
        );
      }
    },
  );
}
