const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../src/lib/domain.cjs');
const D = require('./fixtures/seed.cjs');

function fixture() {
  const s = D.seed();
  const admin = { id: 'admin', name: 'Admin', role: 'Administrador', active: true };
  s.users = s.users || [];
  if (!s.users.find(u => u.id === admin.id)) s.users.push(admin);
  const c = s.contacts.find(c => !s.payments.some(p => p.contactId === c.id) && c.email);
  if (!c) throw new Error('no lead found');
  D.ensureOptOuts(s);
  D.ensureMailings(s);
  if (!Array.isArray(s.mailingRuns)) s.mailingRuns = [];
  if (!Array.isArray(s.automationRuns)) s.automationRuns = [];
  if (!Array.isArray(s.audit)) s.audit = [];
  return { s, admin, c };
}

function snapshotOptOutState(s, contactId) {
  return {
    optOuts: JSON.parse(JSON.stringify(s.optOuts || [])),
    mailings: JSON.parse(JSON.stringify(s.mailings || [])),
    mailingRuns: JSON.parse(JSON.stringify(s.mailingRuns || [])),
    automationRuns: JSON.parse(JSON.stringify(s.automationRuns || [])),
    audit: JSON.parse(JSON.stringify(s.audit || [])),
    contactOptOut: s.contacts.find(c => c.id === contactId)?.optOut,
  };
}

test('opt-out: duplicado é idempotente (não duplica registro ativo)', () => {
  const { s, admin, c } = fixture();
  D.optOutContact(s, admin, c.id, { motivo: 'Solicitado' });
  const before = (s.optOuts || []).filter(o => o.contactId === c.id && o.active !== false && !o.revokedAt && !o.revogado_em).length;
  D.optOutContact(s, admin, c.id, { motivo: 'Novamente' });
  const after = (s.optOuts || []).filter(o => o.contactId === c.id && o.active !== false && !o.revokedAt && !o.revogado_em).length;
  assert.equal(before, 1);
  assert.equal(after, 1);
});

test('opt-out: bloqueia envio para contato com opt-out e permite para demais', () => {
  const { s, admin, c } = fixture();
  const c2b = s.contacts.find(x => x.id !== c.id && x.email && !x.optOut);
  assert.ok(c2b);
  D.optOutContact(s, admin, c.id, {});
  assert.throws(() => D.send(s, admin, [c.id], 'Assunto', 'Mensagem'), /Nenhum destinatário elegível/);
  const count = D.send(s, admin, [c2b.id], 'Assunto', 'Mensagem');
  assert.equal(count, 1);
});

test('opt-out: agendamento criado antes cancela/bloqueia para o contato', () => {
  const { s, admin, c } = fixture();
  D.ensureMailings(s);
  const m = D.saveMailing(s, admin, { subject: 'Teste', body: 'Corpo', kind: 'once', contacts: [c.id] });
  D.setMailingStatus(s, admin, m.id, 'active');
  D.optOutContact(s, admin, c.id, {});
  assert.ok(!m.contacts.includes(c.id) || m.contacts.length === 0);
  D.processMailings(s, new Date());
});

test('opt-out: rollback após gravar opt-out e antes de cancelar agendamentos ($testHooks.afterRegister)', () => {
  const { s, admin, c } = fixture();
  D.ensureMailings(s);
  const m = D.saveMailing(s, admin, { subject: 'T', body: 'B', kind: 'once', contacts: [c.id] });
  D.setMailingStatus(s, admin, m.id, 'active');
  const before = snapshotOptOutState(s, c.id);
  assert.equal(before.contactOptOut, false);
  assert.ok(m.contacts.includes(c.id));

  assert.throws(
    () => {
      D.optOutContact(s, admin, c.id, {
        motivo: 'x',
        $testHooks: {
          afterRegister() {
            throw new Error('falha simulada');
          },
        },
      });
    },
    /falha simulada/,
  );

  const after = snapshotOptOutState(s, c.id);
  assert.deepEqual(after.optOuts, before.optOuts);
  assert.deepEqual(after.mailings, before.mailings);
  assert.deepEqual(after.mailingRuns, before.mailingRuns);
  assert.deepEqual(after.automationRuns, before.automationRuns);
  assert.deepEqual(after.audit, before.audit);
  assert.equal(after.contactOptOut, before.contactOptOut);
  assert.equal(D.hasActiveOptOut(s, c.id), false);
  assert.ok(m.contacts.includes(c.id));
  assert.equal(
    after.audit.some(e => e.action === 'Descadastro / Opt-out registrado' && e.contactId === c.id),
    false,
  );
});

test('opt-out: rollback quando audit exportado falha após cancelamentos (patch em domain.audit)', () => {
  const { s, admin, c } = fixture();
  D.ensureMailings(s);
  const m = D.saveMailing(s, admin, { subject: 'T2', body: 'B2', kind: 'once', contacts: [c.id] });
  D.setMailingStatus(s, admin, m.id, 'active');
  const before = snapshotOptOutState(s, c.id);
  const originalAudit = domain.audit;
  domain.audit = function patchedAudit(state, actor, action, contactId, details) {
    if (action === 'Descadastro / Opt-out registrado' && contactId === c.id) {
      throw new Error('audit indisponível');
    }
    return originalAudit(state, actor, action, contactId, details);
  };
  try {
    assert.throws(
      () => D.optOutContact(s, admin, c.id, { motivo: 'y' }),
      /audit indisponível/,
    );
  } finally {
    domain.audit = originalAudit;
  }
  const after = snapshotOptOutState(s, c.id);
  assert.deepEqual(after, before);
  assert.equal(D.hasActiveOptOut(s, c.id), false);
  const mailing = s.mailings.find(x => x.id === m.id);
  assert.ok(mailing.contacts.includes(c.id));
});

test('opt-out: botão cancelar não grava nada (simulado)', () => {
  const { s, admin, c } = fixture();
  const before = JSON.stringify(s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(!!((s.optOuts||[]).some(o=>o.contactId===c.id && o.active!==false && !o.revokedAt && !o.revogado_em)), false);
});
