const { test } = require("node:test");
const assert = require("node:assert/strict");
const D = require("./fixtures/seed.cjs");

test("[PB-009 / Issue #16] canDeleteContact bloqueia contato com pagamentos e orienta o operador", () => {
  const s = D.seed();
  // contact-0 has payments in seed data
  const donor = s.contacts.find((c) => c.id === "contact-0");
  assert.ok(s.payments.some((p) => p.contactId === donor.id));

  const checkDonor = D.canDeleteContact(s, donor.id);
  assert.equal(checkDonor.allowed, false);
  assert.match(checkDonor.reason, /histórico financeiro/);
  assert.match(checkDonor.reason, /Cancelado/);

  // Lead without payments
  const lead = s.contacts.find(
    (c) => !s.payments.some((p) => p.contactId === c.id),
  );
  assert.ok(lead);
  const checkLead = D.canDeleteContact(s, lead.id);
  assert.equal(checkLead.allowed, true);

  // Non-existent contact
  const checkInexistent = D.canDeleteContact(s, "inexistente");
  assert.equal(checkInexistent.allowed, false);
  assert.equal(checkInexistent.reason, "Contato não encontrado.");
});

test("[PB-009 / Issue #16] deleteContact exige perfil de Administrador", () => {
  const s = D.seed();
  const operator = { id: "op", name: "Operador", role: "Operador de Captação" };
  const lead = s.contacts.find(
    (c) => !s.payments.some((p) => p.contactId === c.id),
  );

  assert.throws(
    () => D.deleteContact(s, operator, lead.id),
    /Esta ação exige perfil de Administrador\./,
  );
  assert.throws(
    () => D.deleteContact(s, null, lead.id),
    /Esta ação exige perfil de Administrador\./,
  );
});

test("[PB-009 / Issue #16] deleteContact bloqueia exclusão com histórico financeiro", () => {
  const s = D.seed();
  const admin = { id: "adm", name: "Admin", role: "Administrador" };
  const donor = s.contacts.find((c) => c.id === "contact-0");

  assert.throws(
    () => D.deleteContact(s, admin, donor.id),
    /histórico financeiro/,
  );
  // Verify contact was NOT deleted
  assert.ok(s.contacts.some((c) => c.id === donor.id));
});

test("[PB-009 / Issue #16] deleteContact remove contato sem pagamentos, limpa listas, tarefas e grava auditoria", () => {
  const s = D.seed();
  const admin = { id: "adm", name: "Admin", role: "Administrador" };
  const lead = s.contacts.find(
    (c) => !s.payments.some((p) => p.contactId === c.id),
  );
  const targetId = lead.id;
  const leadName = lead.name;

  // Add lead to a list and create a task
  if (!s.lists[0].contacts.includes(targetId)) {
    s.lists[0].contacts.push(targetId);
  }
  s.tasks.push({
    id: "task-test",
    contactId: targetId,
    text: "Ligar para lead",
    done: false,
    at: new Date().toISOString(),
  });

  const auditCountBefore = s.audit.length;
  const deleted = D.deleteContact(s, admin, targetId);

  assert.equal(deleted.id, targetId);
  assert.ok(!s.contacts.some((c) => c.id === targetId));
  assert.ok(!s.lists.some((l) => l.contacts.includes(targetId)));
  assert.ok(!s.tasks.some((t) => t.contactId === targetId));

  // Audit entry verification
  assert.equal(s.audit.length, auditCountBefore + 1);
  const auditEntry = s.audit[0];
  assert.equal(auditEntry.action, "Contato excluído");
  assert.equal(auditEntry.actor, admin.id);
  assert.equal(auditEntry.details, leadName);
});
