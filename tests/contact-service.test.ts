import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteContact,
  deleteContact,
} from "../src/lib/contact-service.ts";
import type { CRMState, User } from "../src/types/crm.ts";
import D from "./fixtures/seed.cjs";

test("[TypeScript Service] canDeleteContact bloqueia exclusão com histórico financeiro", () => {
  const state = D.seed() as CRMState;
  const donor = state.contacts.find((c) => c.id === "contact-0");
  assert.ok(donor);

  const result = canDeleteContact(state, donor.id);
  assert.equal(result.allowed, false);
  assert.match(result.reason || "", /histórico financeiro/);
});

test("[TypeScript Service] canDeleteContact permite exclusão de lead sem lançamentos", () => {
  const state = D.seed() as CRMState;
  const lead = state.contacts.find(
    (c) => !state.payments.some((p) => p.contactId === c.id),
  );
  assert.ok(lead);

  const result = canDeleteContact(state, lead.id);
  assert.equal(result.allowed, true);
  assert.equal(result.reason, undefined);
});

test("[TypeScript Service] deleteContact bloqueia usuários não-administradores", () => {
  const state = D.seed() as CRMState;
  const operator: User = {
    id: "op-1",
    name: "Operador Teste",
    email: "op@exemplo.com",
    role: "Operador de Captação",
    active: true,
  };
  const lead = state.contacts.find(
    (c) => !state.payments.some((p) => p.contactId === c.id),
  );
  assert.ok(lead);

  assert.throws(
    () => deleteContact(state, operator, lead.id),
    /Esta ação exige perfil de Administrador\./,
  );
});

test("[TypeScript Service] deleteContact remove lead, limpa tarefas e listas e registra auditoria", () => {
  const state = D.seed() as CRMState;
  const admin: User = {
    id: "admin-1",
    name: "Admin Teste",
    email: "admin@exemplo.com",
    role: "Administrador",
    active: true,
  };
  const lead = state.contacts.find(
    (c) => !state.payments.some((p) => p.contactId === c.id),
  );
  assert.ok(lead);
  const targetId = lead.id;
  const targetName = lead.name;

  state.tasks.push({
    id: "task-ts-1",
    contactId: targetId,
    text: "Atividade de teste",
    done: false,
    at: new Date().toISOString(),
  });

  const auditCountBefore = state.audit.length;
  const deleted = deleteContact(state, admin, targetId);

  assert.equal(deleted.id, targetId);
  assert.ok(!state.contacts.some((c) => c.id === targetId));
  assert.ok(!state.tasks.some((t) => t.contactId === targetId));
  assert.ok(!state.lists.some((l) => l.contacts.includes(targetId)));

  assert.equal(state.audit.length, auditCountBefore + 1);
  assert.equal(state.audit[0].action, "Contato excluído");
  assert.equal(state.audit[0].details, targetName);
});
