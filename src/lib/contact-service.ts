import type {
  CanDeleteContactResult,
  Contact,
  CRMState,
  User,
} from "../types/crm";
import D from "./domain.cjs";

/**
 * Checks whether a contact is eligible for deletion.
 * Enforces the business rule that prevents deleting contacts with financial history.
 *
 * @param state Current CRM state
 * @param contactId ID of the contact to check
 * @returns Result object with allowed status and explanation message if blocked
 */
export function canDeleteContact(
  state: CRMState,
  contactId: string,
): CanDeleteContactResult {
  const contact = state.contacts?.find((c) => c.id === contactId);
  if (!contact) {
    return { allowed: false, reason: "Contato não encontrado." };
  }

  const hasFinancialRecords = state.payments?.some(
    (payment) => payment.contactId === contactId,
  );

  if (hasFinancialRecords) {
    return {
      allowed: false,
      reason:
        "Este doador possui histórico financeiro e seu cadastro não pode ser excluído. Para encerrar a recorrência, altere o status para Cancelado.",
    };
  }

  return { allowed: true };
}

export function hasActiveOptOut(state: CRMState, contactId: string): boolean {
  try {
    if ((D as any).hasActiveOptOut) return (D as any).hasActiveOptOut(state, contactId);
    if ((D as any).getActiveOptOut) return !!(D as any).getActiveOptOut(state, contactId);
  } catch {}
  const list: any[] = (state as any).optOuts || (state as any).optouts || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    if (o.contactId === contactId) {
      if (o.revokedAt || o.revogado_em) continue;
      if (o.active === false) continue;
      return true;
    }
  }
  const c = state.contacts?.find((c: any) => c.id === contactId);
  return !!(c as any)?.optOut;
}

export function registerOptOut(
  state: CRMState,
  user: User,
  contactId: string,
  data: any = {},
): any {
  try {
    if ((D as any).optOutContact) {
      const res = (D as any).optOutContact(state, user, contactId, data);
      return res?.optOut || res;
    }
    if ((D as any).registerOptOut) {
      return (D as any).registerOptOut(state, user, contactId, data);
    }
  } catch (e) {
    throw e;
  }
  const at = new Date().toISOString();
  const rec: any = {
    id: (globalThis as any).crypto?.randomUUID?.() || "opt-" + Date.now().toString(36),
    contactId,
    at,
    data_hora: at,
    origem: "manual",
    origin: "manual",
    registrado_por: user.id,
    registeredBy: user.id,
    registradoPor: user.id,
    actor: user.id,
    actorName: user.name,
    motivo: data.motivo || data.reason || "",
    observacao: data.observacao || "",
    revokedAt: null,
    revogado_em: null,
    active: true,
  };
  (state as any).optOuts = (state as any).optOuts || [];
  (state as any).optOuts.unshift(rec);
  const c = state.contacts?.find((c: any) => c.id === contactId);
  if (c) (c as any).optOut = true;
  // audit
  const auditEntry: any = {
    id: (globalThis as any).crypto?.randomUUID?.() || "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2),
    at,
    actor: user.id,
    actorName: user.name,
    action: "Descadastro / Opt-out registrado",
    contactId,
    details: data.motivo || data.reason || "Opt-out registrado",
  };
  state.audit = state.audit || [];
  state.audit.unshift(auditEntry);
  // cancel mailings
  if ((state as any).mailings) {
    for (const m of (state as any).mailings) {
      if (Array.isArray(m.contacts)) m.contacts = m.contacts.filter((id: string) => id !== contactId);
    }
  }
  return rec;
}

/**
 * Deletes a contact and cleans up cascading references in lists and tasks.
 * Audits the action in the immutable audit log.
 *
 * @param state Current CRM state
 * @param user User performing the deletion
 * @param contactId ID of the contact to delete
 * @returns The deleted contact object
 * @throws Error if user is not Administrator or if contact has financial history
 */
export function deleteContact(
  state: CRMState,
  user: User,
  contactId: string,
): Contact {
  if (!user || user.role !== "Administrador") {
    throw new Error("Esta ação exige perfil de Administrador.");
  }

  const contact = state.contacts?.find((c) => c.id === contactId);
  if (!contact) {
    throw new Error("Contato não encontrado.");
  }

  const check = canDeleteContact(state, contactId);
  if (!check.allowed) {
    throw new Error(check.reason);
  }

  // Register in audit trail
  const auditEntry = {
    id:
      globalThis.crypto?.randomUUID?.() ||
      "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2),
    at: new Date().toISOString(),
    actor: user.id,
    actorName: user.name,
    action: "Contato excluído",
    contactId: null,
    details: contact.name,
  };
  state.audit.unshift(auditEntry);

  // Remove contact
  state.contacts = state.contacts.filter((c) => c.id !== contactId);

  // Remove from lists
  for (const list of state.lists || []) {
    list.contacts = (list.contacts || []).filter((id) => id !== contactId);
  }

  // Remove pending tasks
  state.tasks = (state.tasks || []).filter((task) => task.contactId !== contactId);

  return contact;
}
