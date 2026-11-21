import type { Prisma } from "@/generated/prisma/client.ts";
import type { AuthenticatedUser } from "@/lib/auth-service.ts";
import { recordAuditEvent } from "@/lib/audit-service.ts";
import type {
  CanDeleteContactResult,
  Contact,
  ContactOptOutDetails,
  CRMState,
  HistoryEvent,
  Origin,
  Payment,
  User,
} from "../types/crm";
import D from "./domain.cjs";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STRICT_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OFFICIAL_STAGES = [
  "Aprendizado e descoberta",
  "Reconhecimento do problema",
  "Consideração da solução",
  "Decisão de doação",
] as const;

const INTERACTION_LABELS: Record<string, string> = {
  telefone: "Telefone",
  whatsapp: "WhatsApp",
  reuniao: "Reunião presencial",
  email: "E-mail",
};

const RESPONSE_LABELS: Record<string, string> = {
  positiva: "Positiva",
  negativa: "Negativa",
  descadastro: "Pedido de descadastro",
};

const DEFAULT_OPTOUT_CONTENT = "Pedido de descadastro registrado manualmente";

export class ContactServiceError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ContactServiceError";
    this.status = status;
    this.code = code;
  }
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

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

export interface ContactMutationInput {
  name?: unknown;
  type?: unknown;
  email?: unknown;
  phone?: unknown;
  document?: unknown;
  origin?: unknown;
  funnel?: unknown;
  stage?: unknown;
  owner?: unknown;
  version?: unknown;
  dataCadastro?: unknown;
}

export interface InteractionInput {
  canal?: unknown;
  channel?: unknown;
  ocorridoEm?: unknown;
  date?: unknown;
  resumo?: unknown;
  summary?: unknown;
}

export interface ResponseInput {
  classificacao?: unknown;
  classification?: unknown;
  conteudo?: unknown;
  message?: unknown;
  motivo?: unknown;
  reason?: unknown;
  observacao?: unknown;
  envioDestinatarioId?: unknown;
}

function formatDateTimeBR(value: Date | string): string {
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function normalizeEmail(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalizeDigits(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits ? digits : null;
}

function normalizeOriginCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeFunnel(raw: unknown): "inbound" | "outbound" | null {
  if (typeof raw !== "string") return null;
  const lowered = raw.trim().toLowerCase();
  if (lowered === "inbound" || lowered === "outbound") return lowered;
  return null;
}

export function normalizeInteractionChannelInput(
  raw: unknown,
): "telefone" | "whatsapp" | "reuniao" | "email" | null {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized === "telefone" || normalized === "phone") return "telefone";
  if (normalized === "whatsapp") return "whatsapp";
  if (
    normalized === "reuniao" ||
    normalized === "reuniao presencial" ||
    normalized === "presencial"
  ) {
    return "reuniao";
  }
  if (normalized === "email" || normalized === "e-mail") return "email";
  return null;
}

export function normalizeResponseClassificationInput(
  raw: unknown,
): "positiva" | "negativa" | "descadastro" | null {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized === "positiva") return "positiva";
  if (normalized === "negativa") return "negativa";
  if (
    normalized === "descadastro" ||
    normalized === "pedido de descadastro" ||
    normalized === "optout" ||
    normalized === "opt-out" ||
    normalized === "unsubscribe"
  ) {
    return "descadastro";
  }
  return null;
}

function mapPreferenceToOptOutDetails(pref: any): ContactOptOutDetails | null {
  if (!pref || pref.situacao !== "descadastrado") return null;
  return {
    at:
      pref.vigenteDesde instanceof Date
        ? pref.vigenteDesde.toISOString()
        : String(pref.vigenteDesde),
    actorId: pref.autorId ?? null,
    actorName: pref.autor?.nome || undefined,
    reason: pref.motivo || undefined,
  };
}

function mapDatabaseRowToContact(
  r: any,
  history: HistoryEvent[] = [],
): Contact {
  const activeDescadastro = (r.preferenciasComunicacao || []).find(
    (p: any) => p.situacao === "descadastrado",
  );
  return {
    id: r.id,
    name: r.nome,
    email: r.email || "",
    phone: r.telefone || "",
    document: r.documento || "",
    type: r.tipoPessoa as "PF" | "PJ",
    origin: (r.origem?.nome || "Site") as Origin,
    funnel: (r.classificacao === "inbound" ? "Inbound" : "Outbound") as
      | "Inbound"
      | "Outbound",
    stage: Math.max(0, (r.etapaCaptacao?.ordem ?? 1) - 1),
    owner: r.responsavelId,
    ownerName: r.responsavel?.nome || "",
    version: r.versao,
    created:
      r.dataCadastro instanceof Date
        ? r.dataCadastro.toISOString()
        : String(r.dataCadastro),
    optOut: Boolean(activeDescadastro),
    optOutDetails: mapPreferenceToOptOutDetails(activeDescadastro),
    history,
  };
}

function buildContactAuditSnapshot(contact: Contact) {
  return {
    id: contact.id,
    name: contact.name,
    email: contact.email || null,
    phone: contact.phone || null,
    document: contact.document || null,
    type: contact.type,
    origin: contact.origin,
    funnel: contact.funnel,
    stage: contact.stage,
    owner: contact.owner,
    version: contact.version,
  };
}

function describeAuditEvent(event: any): string {
  if (event.motivo) return String(event.motivo);
  if (event.depois && typeof event.depois === "object") {
    const d = event.depois as Record<string, unknown>;
    if (d.origin && d.funnel) {
      if (event.antes && typeof event.antes === "object") {
        const a = event.antes as Record<string, unknown>;
        if (a.origin !== d.origin || a.funnel !== d.funnel) {
          return `${a.origin || "—"} / ${a.funnel || "—"} → ${d.origin} / ${d.funnel}`;
        }
      }
      return `${d.origin} · ${d.funnel}`;
    }
    if (d.resumo) return String(d.resumo);
  }
  return "";
}

async function resolveOrigin(tx: Prisma.TransactionClient, rawOrigin: unknown) {
  if (typeof rawOrigin !== "string" || !rawOrigin.trim()) {
    throw new ContactServiceError(400, "Selecione uma origem válida.");
  }
  const trimmed = rawOrigin.trim();
  const normalizedCode = normalizeOriginCode(trimmed);
  const origin = await tx.origem.findFirst({
    where: {
      ativo: true,
      OR: [
        { codigo: normalizedCode },
        { codigo: trimmed.toLowerCase() },
        { nome: { equals: trimmed, mode: "insensitive" } },
      ],
    },
  });
  if (!origin) {
    throw new ContactServiceError(400, "Origem informada não encontrada.");
  }
  return origin;
}

async function resolveStageByZeroBasedIndex(
  tx: Prisma.TransactionClient,
  rawStage: unknown,
) {
  const index = rawStage === undefined || rawStage === "" ? 0 : Number(rawStage);
  if (!Number.isInteger(index) || index < 0 || index > 3) {
    throw new ContactServiceError(400, "Selecione uma etapa de captação válida.");
  }
  const etapa = await tx.etapaCaptacao.findUnique({
    where: { ordem: index + 1 },
  });
  if (!etapa) {
    throw new ContactServiceError(400, "Etapa de captação não encontrada.");
  }
  return etapa;
}

async function resolveOwnerId(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  rawOwner: unknown,
  fallbackOwnerId: string,
): Promise<string> {
  if (rawOwner === undefined || rawOwner === null || rawOwner === "") {
    return fallbackOwnerId;
  }
  if (!isValidUuid(rawOwner)) {
    throw new ContactServiceError(400, "Operador responsável inválido.");
  }
  if (actor.profile !== "administrador" && rawOwner !== fallbackOwnerId) {
    throw new ContactServiceError(
      403,
      "Somente administradores podem atribuir outro operador responsável.",
    );
  }
  const owner = await tx.usuario.findFirst({
    where: { id: rawOwner, ativo: true },
    select: { id: true },
  });
  if (!owner) {
    throw new ContactServiceError(
      400,
      "Operador responsável não encontrado ou inativo.",
    );
  }
  return owner.id;
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
    const stageName = OFFICIAL_STAGES[c.stage] || "";
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
  const emptyPage = (): PaginatedContactsResult => ({
    contacts: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 1,
  });

  // Since PostgreSQL schema does not yet model donation plans, there are no DB donors.
  if (params.tab === "donors" || params.tab === "Doadores") {
    return emptyPage();
  }

  const where: any = {
    excluidoEm: null,
  };

  if (params.ids && params.ids.length > 0) {
    const validIds = params.ids.filter(isValidUuid);
    if (validIds.length === 0) return emptyPage();
    where.id = { in: validIds };
  }

  if (params.q) {
    const q = params.q.trim();
    const digits = q.replace(/\D/g, "");
    const orClauses: any[] = [
      { nome: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { telefone: { contains: q } },
      { documento: { contains: q } },
    ];
    if (digits && digits !== q) {
      orClauses.push({ telefone: { contains: digits } });
      orClauses.push({ documento: { contains: digits } });
    }
    where.OR = orClauses;
  }

  if (params.origin) {
    where.origem = {
      is: {
        OR: [
          { nome: { equals: params.origin, mode: "insensitive" } },
          { codigo: { equals: normalizeOriginCode(params.origin) } },
          { codigo: { equals: params.origin.toLowerCase() } },
        ],
      },
    };
  }

  if (params.owner) {
    if (!isValidUuid(params.owner)) return emptyPage();
    where.responsavelId = params.owner;
  }

  if (params.funnel) {
    const funnel = normalizeFunnel(params.funnel);
    if (!funnel) return emptyPage();
    where.classificacao = { equals: funnel };
  }

  if (params.stage !== undefined && params.stage !== "") {
    const stageIdx = Number(params.stage);
    if (!Number.isInteger(stageIdx) || stageIdx < 0 || stageIdx > 3) {
      return emptyPage();
    }
    where.etapaCaptacao = { is: { ordem: stageIdx + 1 } };
  }

  if (params.period) {
    const [year, month] = params.period.split("-").map(Number);
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
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
    return emptyPage();
  }

  const now = new Date();
  const total = await prisma.contato.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));

  const rows = await prisma.contato.findMany({
    where,
    include: {
      origem: true,
      etapaCaptacao: true,
      responsavel: { select: { id: true, nome: true, email: true } },
      preferenciasComunicacao: {
        where: {
          canal: "email",
          situacao: "descadastrado",
          vigenteDesde: { lte: now },
          OR: [{ vigenteAte: null }, { vigenteAte: { gt: now } }],
        },
        include: { autor: { select: { id: true, nome: true } } },
      },
    },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    orderBy: [{ dataCadastro: "desc" }, { criadoEm: "desc" }],
  });

  const contacts: Contact[] = rows.map((r: any) => mapDatabaseRowToContact(r));

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

export async function createContactInDatabase(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  input: ContactMutationInput,
  correlationId: string,
): Promise<Contact> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 180) {
    throw new ContactServiceError(
      400,
      "Informe o nome ou razão social (até 180 caracteres).",
    );
  }

  const type = input.type === "PJ" ? "PJ" : input.type === "PF" || !input.type ? "PF" : null;
  if (!type) {
    throw new ContactServiceError(400, "Tipo de pessoa inválido (use PF ou PJ).");
  }

  const email = normalizeEmail(input.email);
  const phone = normalizeDigits(input.phone);
  const document = normalizeDigits(input.document);

  if (!email && !phone) {
    throw new ContactServiceError(
      400,
      "Informe pelo menos um e-mail ou telefone.",
    );
  }
  if (email && (email.length > 254 || !D.emailValid(email))) {
    throw new ContactServiceError(400, "Informe um e-mail válido.");
  }
  if (phone && !/^\d{10,11}$/.test(phone)) {
    throw new ContactServiceError(
      400,
      "Informe um telefone válido com DDD (10 ou 11 dígitos).",
    );
  }
  if (document && !D.documentValid(document, type)) {
    throw new ContactServiceError(
      400,
      "CPF ou CNPJ inválido. Confira os dígitos.",
    );
  }

  const origem = await resolveOrigin(tx, input.origin);
  const requestedFunnel =
    input.funnel === undefined || input.funnel === ""
      ? origem.classificacaoFixa === "inbound"
        ? "inbound"
        : "inbound"
      : normalizeFunnel(input.funnel);

  if (!requestedFunnel) {
    throw new ContactServiceError(
      400,
      "Classificação inválida (use Inbound ou Outbound).",
    );
  }
  if (origem.classificacaoFixa === "inbound" && requestedFunnel !== "inbound") {
    throw new ContactServiceError(
      400,
      `Contatos de origem ${origem.nome} devem ser Inbound.`,
    );
  }
  const classificacao =
    origem.classificacaoFixa === "inbound" ? "inbound" : requestedFunnel;

  const etapa = await resolveStageByZeroBasedIndex(tx, input.stage);
  const responsavelId = await resolveOwnerId(tx, actor, input.owner, actor.id);

  // Pre-check uniqueness across active AND soft-deleted records so we return 409
  // cleanly without aborting an outer idempotency transaction in PostgreSQL.
  const duplicateConditions: Prisma.ContatoWhereInput[] = [];
  if (email) duplicateConditions.push({ email });
  if (document) duplicateConditions.push({ documento: document });
  if (duplicateConditions.length > 0) {
    const duplicate = await tx.contato.findFirst({
      where: { OR: duplicateConditions },
      select: { id: true },
    });
    if (duplicate) {
      throw new ContactServiceError(
        409,
        "Já existe um contato com este e-mail ou CPF/CNPJ.",
        "DUPLICATE_CONTACT",
      );
    }
  }

  let dataCadastro = new Date();
  if (input.dataCadastro) {
    const parsed = new Date(String(input.dataCadastro));
    if (Number.isNaN(parsed.getTime())) {
      throw new ContactServiceError(400, "Data de cadastro inválida.");
    }
    dataCadastro = parsed;
  }

  // Trigger contatos_inicializar_preferencia automatically inserts initial 'permitido' preference.
  const created = await tx.contato.create({
    data: {
      nome: name,
      tipoPessoa: type,
      email,
      telefone: phone,
      documento: document,
      origemId: origem.id,
      classificacao,
      etapaCaptacaoId: etapa.id,
      responsavelId,
      dataCadastro,
      criadoPorId: actor.id,
    },
    include: {
      origem: true,
      etapaCaptacao: true,
      responsavel: { select: { id: true, nome: true, email: true } },
      preferenciasComunicacao: {
        where: { canal: "email", vigenteAte: null },
        include: { autor: { select: { id: true, nome: true } } },
      },
    },
  });

  const mapped = mapDatabaseRowToContact(created);
  await recordAuditEvent(
    {
      actorType: "usuario",
      actorId: actor.id,
      contactId: created.id,
      action: "Contato cadastrado",
      entityType: "Contato",
      entityId: created.id,
      correlationId,
      after: buildContactAuditSnapshot(mapped),
    },
    tx,
  );

  return mapped;
}

export async function updateContactInDatabase(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  id: string,
  input: ContactMutationInput,
  correlationId: string,
): Promise<Contact> {
  if (!isValidUuid(id)) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const existing = await tx.contato.findFirst({
    where: { id, excluidoEm: null },
    include: {
      origem: true,
      etapaCaptacao: true,
      responsavel: { select: { id: true, nome: true, email: true } },
      preferenciasComunicacao: {
        where: { canal: "email", vigenteAte: null },
        include: { autor: { select: { id: true, nome: true } } },
      },
    },
  });
  if (!existing) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const expectedVersion =
    input.version === undefined || input.version === null
      ? existing.versao
      : Number(input.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    throw new ContactServiceError(400, "Versão do registro inválida.");
  }
  if (expectedVersion !== existing.versao) {
    throw new ContactServiceError(
      409,
      "Este contato foi alterado por outro operador. Recarregue a ficha e tente novamente.",
      "VERSION_CONFLICT",
    );
  }

  const name =
    input.name !== undefined ? String(input.name).trim() : existing.nome;
  if (!name || name.length > 180) {
    throw new ContactServiceError(
      400,
      "Informe o nome ou razão social (até 180 caracteres).",
    );
  }

  const type =
    input.type !== undefined
      ? input.type === "PJ"
        ? "PJ"
        : input.type === "PF"
          ? "PF"
          : null
      : (existing.tipoPessoa as "PF" | "PJ");
  if (!type) {
    throw new ContactServiceError(400, "Tipo de pessoa inválido (use PF ou PJ).");
  }

  const email =
    input.email !== undefined ? normalizeEmail(input.email) : existing.email;
  const phone =
    input.phone !== undefined ? normalizeDigits(input.phone) : existing.telefone;
  const document =
    input.document !== undefined
      ? normalizeDigits(input.document)
      : existing.documento;

  if (!email && !phone) {
    throw new ContactServiceError(
      400,
      "Informe pelo menos um e-mail ou telefone.",
    );
  }
  if (email && (email.length > 254 || !D.emailValid(email))) {
    throw new ContactServiceError(400, "Informe um e-mail válido.");
  }
  if (phone && !/^\d{10,11}$/.test(phone)) {
    throw new ContactServiceError(
      400,
      "Informe um telefone válido com DDD (10 ou 11 dígitos).",
    );
  }
  if (document && !D.documentValid(document, type)) {
    throw new ContactServiceError(
      400,
      "CPF ou CNPJ inválido. Confira os dígitos.",
    );
  }

  const origem =
    input.origin !== undefined
      ? await resolveOrigin(tx, input.origin)
      : existing.origem;

  const requestedFunnel =
    input.funnel !== undefined
      ? normalizeFunnel(input.funnel)
      : (existing.classificacao as "inbound" | "outbound");

  if (!requestedFunnel) {
    throw new ContactServiceError(
      400,
      "Classificação inválida (use Inbound ou Outbound).",
    );
  }
  if (origem.classificacaoFixa === "inbound" && requestedFunnel !== "inbound") {
    throw new ContactServiceError(
      400,
      `Contatos de origem ${origem.nome} devem ser Inbound.`,
    );
  }
  const classificacao =
    origem.classificacaoFixa === "inbound" ? "inbound" : requestedFunnel;

  const responsavelId =
    input.owner !== undefined
      ? await resolveOwnerId(tx, actor, input.owner, existing.responsavelId)
      : existing.responsavelId;

  // Check duplicates against all other rows (including soft-deleted).
  const duplicateConditions: Prisma.ContatoWhereInput[] = [];
  if (email) duplicateConditions.push({ email });
  if (document) duplicateConditions.push({ documento: document });
  if (duplicateConditions.length > 0) {
    const duplicate = await tx.contato.findFirst({
      where: {
        id: { not: id },
        OR: duplicateConditions,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ContactServiceError(
        409,
        "Já existe um contato com este e-mail ou CPF/CNPJ.",
        "DUPLICATE_CONTACT",
      );
    }
  }

  const beforeMapped = mapDatabaseRowToContact(existing);

  // Optimistic locking update; NEVER alters etapaCaptacaoId (regra PB-008 / #15).
  const result = await tx.contato.updateMany({
    where: { id, excluidoEm: null, versao: expectedVersion },
    data: {
      nome: name,
      tipoPessoa: type,
      email,
      telefone: phone,
      documento: document,
      origemId: origem.id,
      classificacao,
      responsavelId,
      versao: { increment: 1 },
    },
  });

  if (result.count === 0) {
    throw new ContactServiceError(
      409,
      "Este contato foi alterado por outro operador. Recarregue a ficha e tente novamente.",
      "VERSION_CONFLICT",
    );
  }

  const updated = await tx.contato.findUniqueOrThrow({
    where: { id },
    include: {
      origem: true,
      etapaCaptacao: true,
      responsavel: { select: { id: true, nome: true, email: true } },
      preferenciasComunicacao: {
        where: { canal: "email", vigenteAte: null },
        include: { autor: { select: { id: true, nome: true } } },
      },
    },
  });

  const afterMapped = mapDatabaseRowToContact(updated);

  if (
    beforeMapped.origin !== afterMapped.origin ||
    beforeMapped.funnel !== afterMapped.funnel
  ) {
    await recordAuditEvent(
      {
        actorType: "usuario",
        actorId: actor.id,
        contactId: id,
        action: "Origem e direção alteradas",
        entityType: "Contato",
        entityId: id,
        correlationId,
        before: { origin: beforeMapped.origin, funnel: beforeMapped.funnel },
        after: { origin: afterMapped.origin, funnel: afterMapped.funnel },
        reason: `${beforeMapped.origin} / ${beforeMapped.funnel} → ${afterMapped.origin} / ${afterMapped.funnel}`,
      },
      tx,
    );
  }

  await recordAuditEvent(
    {
      actorType: "usuario",
      actorId: actor.id,
      contactId: id,
      action: "Cadastro atualizado",
      entityType: "Contato",
      entityId: id,
      correlationId,
      before: buildContactAuditSnapshot(beforeMapped),
      after: buildContactAuditSnapshot(afterMapped),
    },
    tx,
  );

  return afterMapped;
}

export async function getContact360FromDatabase(
  prisma: any,
  id: string,
): Promise<(Contact & { interactions: any[]; responses: any[] }) | null> {
  if (!isValidUuid(id)) return null;

  const now = new Date();
  const row = await prisma.contato.findFirst({
    where: { id, excluidoEm: null },
    include: {
      origem: true,
      etapaCaptacao: true,
      responsavel: { select: { id: true, nome: true, email: true } },
      interacoes: {
        include: { autor: { select: { id: true, nome: true } } },
        orderBy: [{ ocorridoEm: "desc" }, { criadoEm: "desc" }],
      },
      respostasContato: {
        include: { autor: { select: { id: true, nome: true } } },
        orderBy: { criadoEm: "desc" },
      },
      preferenciasComunicacao: {
        where: {
          canal: "email",
          vigenteDesde: { lte: now },
          OR: [{ vigenteAte: null }, { vigenteAte: { gt: now } }],
        },
        include: { autor: { select: { id: true, nome: true } } },
      },
    },
  });

  if (!row) return null;

  const auditEvents = await prisma.eventoAuditoria.findMany({
    where: { contatoId: id },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });

  const actorIds = Array.from(
    new Set(
      auditEvents
        .map((e: any) => e.atorId)
        .filter((actorId: unknown): actorId is string => isValidUuid(actorId)),
    ),
  );
  const actors = actorIds.length
    ? await prisma.usuario.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, nome: true },
      })
    : [];
  const actorNameById = new Map<string, string>(
    actors.map((a: { id: string; nome: string }) => [a.id, a.nome]),
  );

  const history: HistoryEvent[] = [];

  for (const interacao of row.interacoes || []) {
    const label = INTERACTION_LABELS[interacao.canal] || interacao.canal;
    history.push({
      id: interacao.id,
      at:
        interacao.criadoEm instanceof Date
          ? interacao.criadoEm.toISOString()
          : String(interacao.criadoEm),
      actor: interacao.autorId,
      actorName: interacao.autor?.nome || "—",
      action: `Contato por ${label}`,
      contactId: id,
      details: `${interacao.resumo}\nData do contato: ${formatDateTimeBR(interacao.ocorridoEm)}`,
    });
  }

  for (const resposta of row.respostasContato || []) {
    const isOptOut = resposta.classificacao === "descadastro";
    const label =
      RESPONSE_LABELS[resposta.classificacao] || resposta.classificacao;
    history.push({
      id: resposta.id,
      at:
        resposta.criadoEm instanceof Date
          ? resposta.criadoEm.toISOString()
          : String(resposta.criadoEm),
      actor: resposta.autorId,
      actorName: resposta.autor?.nome || "—",
      action: isOptOut
        ? "Descadastro / Opt-out registrado"
        : `Resposta de e-mail: ${label}`,
      contactId: id,
      details: resposta.conteudo,
    });
  }

  for (const ev of auditEvents) {
    if (
      ev.entidadeTipo === "interacoes" ||
      ev.entidadeTipo === "respostas_contato" ||
      ev.acao === "comunicacao.descadastro"
    ) {
      continue;
    }
    history.push({
      id: ev.id,
      at:
        ev.criadoEm instanceof Date
          ? ev.criadoEm.toISOString()
          : String(ev.criadoEm),
      actor: ev.atorId || "system",
      actorName:
        ev.atorTipo === "sistema"
          ? "Sistema"
          : (ev.atorId && actorNameById.get(ev.atorId)) || "—",
      action: ev.acao,
      contactId: id,
      details: describeAuditEvent(ev),
    });
  }

  history.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const contact = mapDatabaseRowToContact(row, history);

  return {
    ...contact,
    interactions: (row.interacoes || []).map((i: any) => ({
      id: i.id,
      canal: i.canal,
      ocorridoEm:
        i.ocorridoEm instanceof Date
          ? i.ocorridoEm.toISOString()
          : String(i.ocorridoEm),
      criadoEm:
        i.criadoEm instanceof Date
          ? i.criadoEm.toISOString()
          : String(i.criadoEm),
      resumo: i.resumo,
      autorId: i.autorId,
      autorNome: i.autor?.nome || "—",
    })),
    responses: (row.respostasContato || []).map((r: any) => ({
      id: r.id,
      classificacao: r.classificacao,
      conteudo: r.conteudo,
      criadoEm:
        r.criadoEm instanceof Date
          ? r.criadoEm.toISOString()
          : String(r.criadoEm),
      autorId: r.autorId,
      autorNome: r.autor?.nome || "—",
    })),
  };
}

/**
 * Verificação de vínculo/histórico financeiro no PostgreSQL.
 * Ponto de extensão preparado para as tabelas de planos/pagamentos (PB-060 / PB-061).
 */
export async function hasFinancialHistoryInDatabase(
  _tx: Prisma.TransactionClient,
  _contactId: string,
): Promise<boolean> {
  return false;
}

export async function softDeleteContactInDatabase(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  id: string,
  correlationId: string,
  financialCheck: (
    transaction: Prisma.TransactionClient,
    contactId: string,
  ) => Promise<boolean> = hasFinancialHistoryInDatabase,
): Promise<Contact> {
  if (actor.profile !== "administrador") {
    throw new ContactServiceError(
      403,
      "Esta ação exige perfil de Administrador.",
    );
  }

  if (!isValidUuid(id)) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const existing = await tx.contato.findFirst({
    where: { id, excluidoEm: null },
    include: {
      origem: true,
      etapaCaptacao: true,
      responsavel: { select: { id: true, nome: true, email: true } },
      preferenciasComunicacao: {
        where: { canal: "email", vigenteAte: null },
        include: { autor: { select: { id: true, nome: true } } },
      },
    },
  });

  if (!existing) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const hasFinancialHistory = await financialCheck(tx, id);
  if (hasFinancialHistory) {
    throw new ContactServiceError(
      409,
      "Este doador possui histórico financeiro e seu cadastro não pode ser excluído. Para encerrar a recorrência, altere o status para Cancelado.",
      "FINANCIAL_HISTORY_BLOCK",
    );
  }

  const snapshot = mapDatabaseRowToContact(existing);
  const now = new Date();

  await tx.contato.update({
    where: { id },
    data: {
      excluidoEm: now,
      versao: { increment: 1 },
    },
  });

  await recordAuditEvent(
    {
      actorType: "usuario",
      actorId: actor.id,
      contactId: id,
      action: "Contato excluído",
      entityType: "Contato",
      entityId: id,
      correlationId,
      before: buildContactAuditSnapshot(snapshot),
    },
    tx,
  );

  return snapshot;
}

export async function createInteractionInDatabase(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  contactId: string,
  input: InteractionInput,
  correlationId: string,
) {
  if (!isValidUuid(contactId)) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const contact = await tx.contato.findFirst({
    where: { id: contactId, excluidoEm: null },
    select: { id: true },
  });
  if (!contact) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const canal = normalizeInteractionChannelInput(input.canal ?? input.channel);
  if (!canal) {
    throw new ContactServiceError(400, "Selecione o canal do contato.");
  }

  const rawDate = input.ocorridoEm ?? input.date;
  if (!rawDate) {
    throw new ContactServiceError(400, "Informe a data e hora da interação.");
  }
  const ocorridoEm = new Date(String(rawDate));
  if (Number.isNaN(ocorridoEm.getTime())) {
    throw new ContactServiceError(400, "Data/hora inválida.");
  }
  if (ocorridoEm.getTime() > Date.now()) {
    throw new ContactServiceError(400, "A data do contato não pode ser futura.");
  }

  const rawResumo = input.resumo ?? input.summary ?? "";
  const resumo = String(rawResumo).trim();
  if (!resumo) {
    throw new ContactServiceError(400, "Informe o resumo da conversa.");
  }
  if (resumo.length > 3000) {
    throw new ContactServiceError(
      400,
      "O resumo não pode ultrapassar 3000 caracteres.",
    );
  }

  const interacao = await tx.interacao.create({
    data: {
      contatoId: contactId,
      canal,
      ocorridoEm,
      resumo,
      autorId: actor.id,
    },
    include: {
      autor: { select: { id: true, nome: true } },
    },
  });

  const label = INTERACTION_LABELS[canal] || canal;
  await recordAuditEvent(
    {
      actorType: "usuario",
      actorId: actor.id,
      contactId,
      action: `Contato por ${label}`,
      entityType: "interacoes",
      entityId: interacao.id,
      correlationId,
      after: {
        canal,
        ocorridoEm: ocorridoEm.toISOString(),
        resumo,
      },
    },
    tx,
  );

  return {
    id: interacao.id,
    contatoId: interacao.contatoId,
    canal: interacao.canal,
    ocorridoEm: interacao.ocorridoEm.toISOString(),
    criadoEm: interacao.criadoEm.toISOString(),
    resumo: interacao.resumo,
    autorId: interacao.autorId,
    autorNome: interacao.autor?.nome || actor.name,
  };
}

export async function createResponseInDatabase(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  contactId: string,
  input: ResponseInput,
  correlationId: string,
) {
  if (!isValidUuid(contactId)) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const contact = await tx.contato.findFirst({
    where: { id: contactId, excluidoEm: null },
    select: { id: true },
  });
  if (!contact) {
    throw new ContactServiceError(404, "Contato não encontrado.");
  }

  const classificacao = normalizeResponseClassificationInput(
    input.classificacao ?? input.classification,
  );
  if (!classificacao) {
    throw new ContactServiceError(
      400,
      "Classificação inválida (use positiva, negativa ou descadastro).",
    );
  }

  const rawContent =
    input.conteudo ?? input.message ?? input.motivo ?? input.reason ?? input.observacao ?? "";
  let conteudo = String(rawContent).trim();

  if (!conteudo) {
    if (classificacao === "descadastro") {
      conteudo = DEFAULT_OPTOUT_CONTENT;
    } else {
      throw new ContactServiceError(400, "Informe o conteúdo da resposta.");
    }
  }
  if (conteudo.length > 3000) {
    throw new ContactServiceError(
      400,
      "O conteúdo da resposta não pode ultrapassar 3000 caracteres.",
    );
  }

  let envioDestinatarioId: string | null = null;
  if (input.envioDestinatarioId) {
    if (!isValidUuid(input.envioDestinatarioId)) {
      throw new ContactServiceError(
        400,
        "Identificador de envio de destinatário inválido.",
      );
    }
    envioDestinatarioId = input.envioDestinatarioId;
  }

  // When classificacao === 'descadastro', PostgreSQL trigger
  // respostas_registrar_descadastro atomically closes the active preference,
  // inserts 'descadastrado' in preferencias_comunicacao, and logs
  // 'comunicacao.descadastro' in eventos_auditoria. Do NOT duplicate those effects.
  const resposta = await tx.respostaContato.create({
    data: {
      contatoId: contactId,
      classificacao,
      conteudo,
      envioDestinatarioId,
      autorId: actor.id,
    },
    include: {
      autor: { select: { id: true, nome: true } },
    },
  });

  if (classificacao !== "descadastro") {
    const label = RESPONSE_LABELS[classificacao] || classificacao;
    await recordAuditEvent(
      {
        actorType: "usuario",
        actorId: actor.id,
        contactId,
        action: `Resposta de e-mail: ${label}`,
        entityType: "respostas_contato",
        entityId: resposta.id,
        correlationId,
        after: {
          classificacao,
          conteudo,
        },
      },
      tx,
    );
  }

  const currentPreference = await tx.preferenciaComunicacao.findFirst({
    where: {
      contatoId: contactId,
      canal: "email",
      vigenteAte: null,
    },
    include: { autor: { select: { id: true, nome: true } } },
  });

  return {
    response: {
      id: resposta.id,
      contatoId: resposta.contatoId,
      classificacao: resposta.classificacao,
      conteudo: resposta.conteudo,
      criadoEm: resposta.criadoEm.toISOString(),
      autorId: resposta.autorId,
      autorNome: resposta.autor?.nome || actor.name,
    },
    optOut: currentPreference?.situacao === "descadastrado",
    preference: currentPreference
      ? {
          id: currentPreference.id,
          canal: currentPreference.canal,
          situacao: currentPreference.situacao,
          vigenteDesde: currentPreference.vigenteDesde.toISOString(),
          vigenteAte: currentPreference.vigenteAte?.toISOString() ?? null,
          motivo: currentPreference.motivo,
          respostaId: currentPreference.respostaId,
          autorId: currentPreference.autorId,
          autorNome: currentPreference.autor?.nome ?? null,
        }
      : null,
  };
}

/**
 * Checks whether a contact is eligible for deletion (legacy in-memory helper).
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
  if ((state as any).mailings) {
    for (const m of (state as any).mailings) {
      if (Array.isArray(m.contacts)) m.contacts = m.contacts.filter((id: string) => id !== contactId);
    }
  }
  return rec;
}

/**
 * Deletes a contact and cleans up cascading references in lists and tasks (legacy in-memory helper).
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

  state.contacts = state.contacts.filter((c) => c.id !== contactId);

  for (const list of state.lists || []) {
    list.contacts = (list.contacts || []).filter((id) => id !== contactId);
  }

  state.tasks = (state.tasks || []).filter((task) => task.contactId !== contactId);

  return contact;
}
