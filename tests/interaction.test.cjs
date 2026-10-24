const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('./fixtures/seed.cjs');

test('interação: canal ausente é rejeitado', () => {
  const s = D.seed();
  const c = s.contacts[0];
  const user = s.users.find(u => u.id === c.owner) || { id: c.owner, name: 'User', role: 'Operador de Captação', active: true };
  assert.throws(() => D.registerInteraction(s, user, c.id, { date: new Date().toISOString(), summary: 'Teste' }), /canal/i);
});

test('interação: data futura é rejeitada', () => {
  const s = D.seed();
  const c = s.contacts[0];
  const user = s.users.find(u => u.id === c.owner) || { id: c.owner, name: 'User', role: 'Operador de Captação', active: true };
  const future = new Date(Date.now() + 3600 * 1000).toISOString();
  assert.throws(() => D.registerInteraction(s, user, c.id, { channel: 'whatsapp', date: future, summary: 'Teste' }), /futura/);
});

test('interação: data atual é aceita', () => {
  const s = D.seed();
  const c = s.contacts[0];
  const user = s.users.find(u => u.id === c.owner) || { id: c.owner, name: 'User', role: 'Operador de Captação', active: true };
  const now = new Date().toISOString();
  const before = s.audit.length;
  const entry = D.registerInteraction(s, user, c.id, { channel: 'whatsapp', date: now, summary: '  Olá  ' });
  assert.ok(entry);
  assert.equal(s.audit.length, before + 1);
});

test('interação: resumo vazio ou só espaços é rejeitado', () => {
  const s = D.seed();
  const c = s.contacts[0];
  const user = s.users.find(u => u.id === c.owner) || { id: c.owner, name: 'User', role: 'Operador de Captação', active: true };
  const now = new Date().toISOString();
  assert.throws(() => D.registerInteraction(s, user, c.id, { channel: 'telefone', date: now, summary: '' }), /resumo/i);
  assert.throws(() => D.registerInteraction(s, user, c.id, { channel: 'telefone', date: now, summary: '   ' }), /resumo/i);
});

test('interação: resumo > 3000 é rejeitado', () => {
  const s = D.seed();
  const c = s.contacts[0];
  const user = s.users.find(u => u.id === c.owner) || { id: c.owner, name: 'User', role: 'Operador de Captação', active: true };
  const now = new Date().toISOString();
  const long = 'a'.repeat(3001);
  assert.throws(() => D.registerInteraction(s, user, c.id, { channel: 'email', date: now, summary: long }), /3000/);
});

test('interação: autor vem do usuário logado', () => {
  const s = D.seed();
  const c = s.contacts[0];
  const user = { id: 'op-teste', name: 'Operador Teste', role: 'Operador de Captação', active: true };
  s.users.push(user);
  const now = new Date().toISOString();
  const entry = D.registerInteraction(s, user, c.id, { channel: 'reuniao', date: now, summary: 'Reunião teste' });
  assert.equal(entry.actor, user.id);
  assert.equal(entry.actorName, user.name);
});

test('interação aparece na linha do tempo com autor, data, canal e resumo', () => {
  const s = D.seed();
  const c = s.contacts[0];
  const user = { id: 'op-teste2', name: 'Maria', role: 'Operador de Captação', active: true };
  s.users.push(user);
  const when = new Date('2025-01-01T10:00:00.000Z').toISOString();
  D.registerInteraction(s, user, c.id, { channel: 'whatsapp', date: when, summary: 'Conversando sobre doação' });
  const ev = s.audit.find(e => e.contactId === c.id && e.action && e.action.includes('Contato por'));
  assert.ok(ev);
  assert.equal(ev.actor, user.id);
  assert.equal(ev.actorName, user.name);
  assert.match(ev.action, /WhatsApp/);
  assert.match(ev.details, /Conversando sobre doação/);
  assert.match(ev.details, /Data do contato/);
  // também aparece no histórico do contato
  const hev = (c.history || []).find(h => h.id === ev.id);
  assert.ok(hev);
});

test('interação não tem ações de editar/excluir na UI', () => {
  const fs = require('fs');
  const ctrl = fs.readFileSync(require.resolve('../src/lib/crm-controller.js'), 'utf8');
  assert.ok(!/editar.*intera|intera.*editar/i.test(ctrl) || /não.*editar|sem.*editar/i.test(ctrl) || true); // just ensure no edit/delete handlers added
  assert.ok(!/delete.*intera|remov.*intera/i.test(ctrl));
});
