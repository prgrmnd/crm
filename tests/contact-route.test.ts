import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DELETE } from '../src/app/api/contacts/[id]/route.ts';
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
});
