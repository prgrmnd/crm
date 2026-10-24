import { NextRequest, NextResponse } from "next/server";
import { canDeleteContact, deleteContact, registerOptOut } from "@/lib/contact-service.ts";
import type { CRMState, User } from "@/types/crm.ts";

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

    const deleted = deleteContact(state, user, id);
    return NextResponse.json({
      success: true,
      allowed: true,
      contact: deleted,
      state,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro interno ao processar exclusão." },
      { status: error.message?.includes("Administrador") ? 403 : 500 },
    );
  }
}
