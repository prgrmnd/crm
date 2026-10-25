const { test } = require('node:test');
const assert = require('node:assert/strict');

const API_URL = 'http://127.0.0.1:3000/api/auth/recuperar-senha';

test('Garante resposta opaca (Status 200) para e-mail existente', async () => {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.1' },
    body: JSON.stringify({ email: 'admin@luz.exemplo' })
  });
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.equal(data.message, 'Se o e-mail estiver cadastrado, você receberá as instruções.');
});

test('Garante resposta opaca (Status 200) para e-mail inexistente', async () => {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.2' },
    body: JSON.stringify({ email: 'fantasma@luz.exemplo' })
  });
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.equal(data.message, 'Se o e-mail estiver cadastrado, você receberá as instruções.');
});

test('Garante Rate Limiting (Status 429) após múltiplas tentativas rápidas', async () => {
  for (let i = 0; i < 5; i++) {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.3' },
      body: JSON.stringify({ email: 'spam@luz.exemplo' })
    });
  }

  const resBloqueada = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.3' },
    body: JSON.stringify({ email: 'spam@luz.exemplo' })
  });
  
  assert.equal(resBloqueada.status, 429);
});