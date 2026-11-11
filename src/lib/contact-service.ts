import type {
  CanDeleteContactResult,
  Contact,
  CRMState,
  Payment,
  User,
} from "../types/crm";
import D from "./domain.cjs";

export interface ContactQueryParams {
  page?: number;
  pageSize?: number;
  tab?: "all" | "leads" | "donors" | string;
  q?: string;
  origin?: string;
  owner?: string;
  period?: string;
  funnel?: string;
  status?: string;
  stage?: string | number;
  ids?: string[];
}

export interface PaginatedContactsResult {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function filterContactsList(
  contacts: Contact[],
  params: ContactQueryParams = {},
  payments: Payment[] = [],
): Contact[] {
  const q = (params.q || "").trim().toLocaleLowerCase("pt-BR");
  const tab = params.tab || "all";

  return contacts.filter((c) => {
    if (params.ids && params.ids.length > 0) {
      if (!params.ids.includes(c.id)) return false;
    }

    if (tab === "leads" || tab === "Potenciais" || tab === "Potenciais doadores") {
      if (c.plan) return false;
    } else if (tab === "donors" || tab === "Doadores") {
      if (!c.plan) return false;
    }

    if (q) {
      const match = [c.name, c.email, c.phone, c.document].some((v) =>
        (v || "").toLocaleLowerCase("pt-BR").includes(q),
      );
      if (!match) return false;
    }

    if (params.origin && c.origin !== params.origin) {
      return false;
    }

    if (params.owner && c.owner !== params.owner) {
      return false;
    }

    if (params.funnel && c.funnel.toLowerCase() !== params.funnel.toLowerCase()) {
      return false;
    }

    if (params.status) {
      if (params.status === "Sócio Inscrito") {
        const isEnrolled = Boolean(
          c.plan && !payments.some((p) => p.contactId === c.id && p.amount > 0),
        );
        if (!isEnrolled) return false;
      } else {
        const contactStatus = c.plan?.status || "Potencial doador";
        if (contactStatus !== params.status) return false;
      }
    }

    if (params.stage !== undefined && params.stage !== "") {
      if (String(c.stage) !== String(params.stage)) return false;
    }

    if (params.period) {
      const contactPeriod = c.cadenceExit?.date
        ? c.cadenceExit.date.slice(0, 7)
        : (c.created || "").slice(0, 7);
      if (contactPeriod !== params.period) return false;
    }

    return true;
  });
}

export function paginateContacts(
  filtered: Contact[],
  page: number = 1,
  pageSize: number = 10,
): PaginatedContactsResult {
  const safePageSize = Math.max(1, pageSize);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));

  const start = (safePage - 1) * safePageSize;
  const contacts = total === 0 ? [] : filtered.slice(start, start + safePageSize);

  return {
    contacts,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export function exportContactsToCSV(
  contacts: Contact[],
  payments: Payment[] = [],
): string {
  const STAGES = [
    "Novo contato",
    "Apresentação da causa",
    "Relacionamento cultivado",
    "Decisão de doação",
  ];

  const escapeCSVValue = (val: unknown): string => {
    const str = String(val ?? "");
    const sanitized = str.replace(/^[=+@-]/, "'$&").replace(/"/g, '""');
    return `"${sanitized}"`;
  };

  const headers = [
    "Nome",
    "Email",
    "Telefone",
    "Tipo",
    "Origem",
    "Funil",
    "Etapa",
    "Status",
    "Identificação",
  ];

  const rows = contacts.map((c) => {
    const isEnrolled = Boolean(
      c.plan && !payments.some((p) => p.contactId === c.id && p.amount > 0),
    );
    const stageName = STAGES[c.stage] || "";
    const status = c.plan?.status || "Potencial doador";
    const identificacao = isEnrolled ? "Sócio Inscrito" : "";

    return [
      escapeCSVValue(c.name),
      escapeCSVValue(c.email || ""),
      escapeCSVValue(c.phone || ""),
      escapeCSVValue(c.type || "PF"),
      escapeCSVValue(c.origin || ""),
      escapeCSVValue(c.funnel || ""),
      escapeCSVValue(stageName),
      escapeCSVValue(status),
      escapeCSVValue(identificacao),
    ].join(";");
  });

  return "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
}

export async function queryContactsFromDatabase(
  prisma: any,
  params: ContactQueryParams = {},
): Promise<PaginatedContactsResult> {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.max(1, Number(params.pageSize) || 10);

  // Since PostgreSQL schema does not yet model donation plans, there are no DB donors.
  if (params.tab === "donors" || params.tab === "Doadores") {
    return {
      contacts: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 1,
    };
  }

  const where: any = {
    excluidoEm: null,
  };

  if (params.ids && params.ids.length > 0) {
    where.id = { in: params.ids };
  }

  if (params.q) {
    const q = params.q.trim();
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { telefone: { contains: q } },
      { documento: { contains: q } },
    ];
  }

  if (params.origin) {
    where.origem = {
      is: {
        OR: [
          { nome: { equals: params.origin, mode: "insensitive" } },
          { codigo: { equals: params.origin.toLowerCase() } },
        ],
      },
    };
  }

  if (params.owner) {
    where.responsavelId = params.owner;
  }

  if (params.funnel) {
    const funnel = params.funnel.toLowerCase();
    where.classificacao =
      funnel === "outbound"
        ? { in: ["outbound", "manual"] }
        : { equals: funnel };
  }

  if (params.stage !== undefined && params.stage !== "") {
    const ordem = Number(params.stage);
    if (Number.isFinite(ordem)) {
      where.etapaCaptacao = { is: { ordem } };
    }
  }

  if (params.period) {
    const [year, month] = params.period.split("-").map(Number);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      where.dataCadastro = {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      };
    }
  }

  // O schema atual não modela planos de doação nem pagamentos. Todo contato
  // persistido é, portanto, um potencial doador; filtros de doador não têm
  // correspondência no banco.
  if (params.status && params.status !== "Potencial doador") {
    return {
      contacts: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 1,
    };
  }

  const total = await prisma.contato.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));

  const rows = await prisma.contato.findMany({
    where,
    include: {
      origem: true,
      etapaCaptacao: true,
      responsavel: true,
      preferenciasComunicacao: {
        where: {
          canal: "email",
          situacao: "bloqueado",
          OR: [{ vigenteAte: null }, { vigenteAte: { gt: new Date() } }],
        },
      },
    },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    orderBy: { dataCadastro: "desc" },
  });

  const contacts: Contact[] = rows.map((r: any) => ({
    id: r.id,
    name: r.nome,
    email: r.email || "",
    phone: r.telefone || "",
    document: r.documento || "",
    type: r.tipoPessoa as "PF" | "PJ",
    origin: (r.origem?.nome || "Site") as any,
    funnel: (r.classificacao === "inbound" ? "Inbound" : "Outbound") as any,
    stage: r.etapaCaptacao?.ordem ?? 0,
    owner: r.responsavelId,
    created:
      r.dataCadastro instanceof Date
        ? r.dataCadastro.toISOString()
        : String(r.dataCadastro),
    optOut: (r.preferenciasComunicacao?.length || 0) > 0,
    history: [],
  }));

  return {
    contacts,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/**
 * Busca todos os contatos que satisfazem os filtros, percorrendo as páginas do
 * banco. Usado pela exportação para não limitar o arquivo ao tamanho de uma
 * página da listagem.
 */
export async function queryAllContactsFromDatabase(
  prisma: any,
  params: ContactQueryParams = {},
): Promise<Contact[]> {
  const pageSize = 1000;
  const contacts = new Map<string, Contact>();
  let page = 1;
  let totalPages = 1;

  do {
    const result = await queryContactsFromDatabase(prisma, {
      ...params,
      page,
      pageSize,
    });
    result.contacts.forEach((contact) => contacts.set(contact.id, contact));
    totalPages = result.totalPages;
    page++;
  } while (page <= totalPages);

  return [...contacts.values()];
}

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
