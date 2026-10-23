import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DELETE } from '../src/app/api/contacts/[id]/route.ts';
import { getPrismaClient } from '../src/lib/prisma.ts';
import type { NextRequest } from 'next/server';
import D from './fixtures/seed.cjs';

describe('DELETE /api/contacts/[id] route', () => {
  test('returns 409 Conflict when contact has financial history', async () => {
    const state = D.seed();
    const donor = state.contacts.find((c: { id: string }) => c.id === 'contact-0');
    assert.ok(donor, 'donor contact should exist');

    const request = {
      json: async () => ({ state, user: { id: 'adm', name: 'Admin', role: 'Administrador' } }),
    } as unknown as NextRequest;

    const context = { params: Promise.resolve({ id: (donor as { id: string }).id }) };

    const response = await DELETE(request, context);
    // NextResponse exposes status property
    assert.equal((response as any).status, 409);
    const body = await (response as any).json();
    assert.equal(body.allowed, false);
    assert.match(body.error ?? body.reason, /histórico financeiro/);
  });

  test('persists sanitized audit event with the request correlation id', async () => {
    const state = D.seed();
    const contact = state.contacts.find((c: { id: string }) => c.id === 'contact-8');
    assert.ok(contact, 'lead contact should exist');
    contact.id = randomUUID();
    const actorId = randomUUID();
    Object.assign(contact, {
      password: 'must-not-be-stored',
      accessToken: 'must-not-be-stored-either',
    });

    const correlationId = randomUUID();
    const request = {
      headers: new Headers({ 'x-correlation-id': correlationId }),
      json: async () => ({
        state,
        user: { id: actorId, name: 'Admin Test', role: 'Administrador' },
      }),
    } as unknown as NextRequest;
    const context = { params: Promise.resolve({ id: contact.id }) };
    const response = await DELETE(request, context);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-correlation-id'), correlationId);

    const client = new Client({ connectionString: process.env.DATABASE_URL_TEST });
    await client.connect();
    try {
      const persisted = await client.query(
        `SELECT ator_tipo, ator_id, contato_id, acao, entidade_tipo, correlacao_id,
                antes, depois
         FROM eventos_auditoria WHERE correlacao_id = $1`,
        [correlationId],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].ator_tipo, 'usuario');
      assert.equal(persisted.rows[0].ator_id, actorId);
      assert.equal(persisted.rows[0].contato_id, contact.id);
      assert.equal(persisted.rows[0].entidade_tipo, 'Contato');
      assert.equal(persisted.rows[0].depois, null);
      assert.equal('password' in persisted.rows[0].antes, false);
      assert.equal('accessToken' in persisted.rows[0].antes, false);
    } finally {
      await client.end();
      await getPrismaClient().$disconnect();
    }
  });
});
