import type {
  CanDeleteContactResult,
  Contact,
  CRMState,
  User,
} from "../types/crm";

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
