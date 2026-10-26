import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/auth/recuperar-senha/route";
import { NextRequest } from "next/server";
import { testWithDatabase } from "./helpers/postgres-test.cjs";
import D from "./fixtures/seed.cjs";

describe("POST /api/auth/recuperar-senha", () => {
  test("retorna 200 OK idêntico para e-mails válidos", () => testWithDatabase(async () => {
    await D.seed();
    const request = {
      headers: new Headers({ "x-forwarded-for": "127.0.0.10" }),
      json: async () => ({ email: "admin@luz.exemplo" })
    } as unknown as NextRequest;

    const response = await POST(request);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.message, "Se o e-mail estiver cadastrado, você receberá as instruções.");
  }));

  test("retorna 200 OK idêntico para e-mails inexistentes", () => testWithDatabase(async () => {
    const request = {
      headers: new Headers({ "x-forwarded-for": "127.0.0.11" }),
      json: async () => ({ email: "naoexiste@exemplo.com" })
    } as unknown as NextRequest;

    const response = await POST(request);
    assert.equal(response.status, 200);
  }));

  test("emissão consecutiva invalida o token anterior sem erro 55000", () => testWithDatabase(async () => {
    await D.seed();
    const req1 = {
      headers: new Headers({ "x-forwarded-for": "127.0.0.12" }),
      json: async () => ({ email: "operador@luz.exemplo" })
    } as unknown as NextRequest;
    const res1 = await POST(req1);
    assert.equal(res1.status, 200);

    const req2 = {
      headers: new Headers({ "x-forwarded-for": "127.0.0.13" }),
      json: async () => ({ email: "operador@luz.exemplo" })
    } as unknown as NextRequest;
    const res2 = await POST(req2);
    assert.equal(res2.status, 200);
  }));

  test("valida bloqueio 429 pelo Rate Limiting", () => testWithDatabase(async () => {
    const req1 = {
      headers: new Headers({ "x-forwarded-for": "127.0.0.14" }),
      json: async () => ({ email: "rate@exemplo.com" })
    } as unknown as NextRequest;
    await POST(req1);

    const req2 = {
      headers: new Headers({ "x-forwarded-for": "127.0.0.14" }),
      json: async () => ({ email: "rate@exemplo.com" })
    } as unknown as NextRequest;
    const response2 = await POST(req2);

    assert.equal(response2.status, 429);
  }));
});