export type UserRole = "Administrador" | "Operador de Captação";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  salt?: string;
  passwordHash?: string;
}

export type ContactType = "PF" | "PJ";

export type Origin =
  | "Instagram"
  | "Site"
  | "Indicação"
  | "E-mail"
  | "Evento"
  | "WhatsApp";

export type FunnelDirection = "Inbound" | "Outbound";

export type DonorStatus =
  | "Ativo"
  | "Inadimplente"
  | "Pausado"
  | "Suspenso"
  | "Cancelado";

export type DonationMode = "Recorrente" | "Pontual";

export interface DonationPlan {
  mode: DonationMode;
  amount: number;
  due: number | null;
  since: string;
  adheredAt?: string;
  status: DonorStatus;
}

export interface CadenceExit {
  reason: string;
  note: string;
  date: string;
  actorName: string;
  stage: number;
  lossStage?: number;
  followUpDate?: string;
}

export interface HistoryEvent {
  id: string;
  at: string;
  actor: string;
  actorName: string;
  action: string;
  contactId?: string;
  details: string;
}

export interface Payment {
  id: string;
  contactId: string;
  amount: number;
  date: string;
  period: string;
  mode: DonationMode;
  pix: string;
  destination: string;
  attachment: string | null;
  at: string;
  actor: string;
  actorName: string;
  receipt: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  document: string;
  type: ContactType;
  origin: Origin;
  funnel: FunnelDirection;
  stage: number;
  owner: string;
  created: string;
  optOut: boolean;
  plan?: DonationPlan;
  cadenceExit?: CadenceExit;
  history: HistoryEvent[];
}

export interface ContactList {
  id: string;
  name: string;
  category: string;
  description: string;
  contacts: string[];
  imports?: Array<{
    imported: number;
    duplicates: number;
    invalid: number;
    rows: string[];
    at: string;
  }>;
}

export interface Task {
  id: string;
  contactId: string;
  text: string;
  done: boolean;
  at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actorName: string;
  action: string;
  contactId?: string | null;
  details: string;
}

export interface CRMState {
  version: number;
  users: User[];
  contacts: Contact[];
  payments: Payment[];
  lists: ContactList[];
  campaigns: unknown[];
  audit: AuditEntry[];
  tasks: Task[];
  resets: unknown[];
  automations?: unknown[];
  automationRuns?: unknown[];
  mailings?: unknown[];
  mailingRuns?: unknown[];
}

export interface CanDeleteContactResult {
  allowed: boolean;
  reason?: string;
}
