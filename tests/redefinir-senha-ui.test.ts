import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import D from "./fixtures/seed.cjs";
import { createViewState } from "../src/lib/view-state.js";
import { createCRMController } from "../src/lib/crm-controller.js";

const TOKEN = "a".repeat(64);
const SENHA = "NovaSenhaSegura@2026";

describe("Issue #13: tela de redefinição de senha", () => {
  let windowOriginal: unknown;
  let localStorageOriginal: unknown;
  let fetchOriginal: unknown;
  let model: ReturnType<typeof createViewState>;

  beforeEach(() => {
    windowOriginal = (globalThis as any).window;
    localStorageOriginal = (globalThis as any).localStorage;
    fetchOriginal = (globalThis as any).fetch;

    const storage: Record<string, string> = {
      "luz-crm-state": JSON.stringify(D.seed()),
    };
    (globalThis as any).localStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = String(value);
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        for (const key of Object.keys(storage)) delete storage[key];
      },
    };

    (globalThis as any).window = {
      location: { hash: `#redefinir=${TOKEN}` },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    };
  });

  afterEach(() => {
    model?.dispose();
    (globalThis as any).window = windowOriginal;
    (globalThis as any).localStorage = localStorageOriginal;
    (globalThis as any).fetch = fetchOriginal;
  });

  test("valida o token do link e envia a nova senha ao servidor", async () => {
    const chamadas: string[] = [];
    let payload: unknown = null;

    (globalThis as any).fetch = async (input: string, init?: RequestInit) => {
      const url = String(input);
      chamadas.push(url);
      if (url.includes("/api/auth/session")) {
        assert.fail("A tela de redefinição não deve consultar a sessão");
      }
      if (url.includes(`/api/auth/redefinir-senha?token=${TOKEN}`)) {
        return { ok: true, status: 200, json: async () => ({ valid: true }) };
      }
      if (url.endsWith("/api/auth/redefinir-senha")) {
        payload = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: "Senha redefinida com sucesso." }),
        };
      }
      if (url.endsWith("/api/auth/logout")) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    model = createViewState(() => {});
    createCRMController(model);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const form = model.view.find("#auth-form");
    assert.ok(form, "O formulário de nova senha deve ser exibido");
    assert.match(
      (model.view.find("#app") as any)?.textContent || "",
      /Uma nova senha/,
    );
    assert.ok(form.find('[name="password"]'));
    assert.ok(form.find('[name="confirm"]'));
    assert.ok(!form.find('[name="email"]'));
    assert.ok(chamadas.some((url) => url.includes("redefinir-senha?token=")));

    // Senhas diferentes não chegam ao servidor.
    (form.find('[name="password"]') as any).value = SENHA;
    (form.find('[name="confirm"]') as any).value = "OutraSenha@2026";
    model.dispatch(form, "submit");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(form.find(".error")?.textContent || "", /iguais/i);
    assert.equal(payload, null);

    // Com senhas iguais e complexas, a redefinição é enviada.
    (form.find('[name="confirm"]') as any).value = SENHA;
    model.dispatch(form, "submit");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(payload, { token: TOKEN, password: SENHA });
    assert.equal((globalThis as any).window.location.hash, "");
    assert.ok(model.view.find('#auth-form [name="email"]'));
  });

  test("descarta links inválidos e volta ao acesso", async () => {
    (globalThis as any).fetch = async (input: string) => {
      const url = String(input);
      if (url.includes("/api/auth/session")) {
        assert.fail("A tela de redefinição não deve consultar a sessão");
      }
      if (url.includes("/api/auth/redefinir-senha?")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            valid: false,
            error: "Token inválido, expirado ou já utilizado.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    model = createViewState(() => {});
    createCRMController(model);
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal((globalThis as any).window.location.hash, "");
    assert.match(model.view.find("#toasts")?.textContent || "", /inválido/i);
    assert.ok(model.view.find('#auth-form [name="email"]'));
    assert.ok(!model.view.find('#auth-form [name="confirm"]'));
  });

  test("mantém o formulário bloqueado até o servidor confirmar o token", async () => {
    let liberarValidacao!: (resposta: unknown) => void;
    const validacao = new Promise<unknown>((resolve) => {
      liberarValidacao = resolve;
    });

    (globalThis as any).fetch = async (input: string) => {
      if (String(input).includes("/api/auth/redefinir-senha?")) {
        return validacao;
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    model = createViewState(() => {});
    createCRMController(model);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal((globalThis as any).window.location.hash, `#redefinir=${TOKEN}`);
    assert.match(model.view.find("#app")?.textContent || "", /Validando seu link/i);
    assert.ok(
      !model.view.find('#auth-form [name="password"]'),
      "Campos de nova senha não devem aparecer antes da validação",
    );
    assert.equal(
      model.view.find('#auth-form button[type="submit"]')?.disabled,
      true,
    );

    liberarValidacao({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.ok(model.view.find('#auth-form [name="password"]'));
    assert.ok(model.view.find('#auth-form [name="confirm"]'));
    assert.equal(
      model.view.find('#auth-form button[type="submit"]')?.disabled,
      false,
    );
  });

  const falhasGet = [
    {
      nome: "410",
      resposta: {
        ok: false,
        status: 410,
        json: async () => ({ valid: false, error: "Link expirado." }),
      },
    },
    {
      nome: "500",
      resposta: {
        ok: false,
        status: 500,
        json: async () => ({ valid: false, error: "Erro interno no servidor." }),
      },
    },
    {
      nome: "200 com valid=false",
      resposta: {
        ok: true,
        status: 200,
        json: async () => ({ valid: false }),
      },
    },
    {
      nome: "erro de rede",
      resposta: () => Promise.reject(new Error("offline")),
    },
  ];

  for (const { nome, resposta } of falhasGet) {
    test(`limpa o hash e retorna ao login quando o GET falha (${nome})`, async () => {
      (globalThis as any).fetch = async (input: string) => {
        if (String(input).includes("/api/auth/redefinir-senha?")) {
          return typeof resposta === "function" ? resposta() : resposta;
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };

      model = createViewState(() => {});
      createCRMController(model);
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.equal((globalThis as any).window.location.hash, "");
      assert.ok(model.view.find('#auth-form [name="email"]'));
      assert.ok(!model.view.find('#auth-form [name="confirm"]'));
      assert.match(model.view.find("#toasts")?.textContent || "", /link|inválid|erro/i);
    });
  }

  test("limpa o hash quando o POST recusa um token expirado", async () => {
    (globalThis as any).fetch = async (input: string) => {
      const url = String(input);
      if (url.includes("/api/auth/redefinir-senha?")) {
        return { ok: true, status: 200, json: async () => ({ valid: true }) };
      }
      if (url.endsWith("/api/auth/redefinir-senha")) {
        return {
          ok: false,
          status: 410,
          json: async () => ({
            error: "Token de recuperação expirado. Solicite um novo link.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    model = createViewState(() => {});
    createCRMController(model);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const form = model.view.find("#auth-form")!;
    (form.find('[name="password"]') as any).value = SENHA;
    (form.find('[name="confirm"]') as any).value = SENHA;
    model.dispatch(form, "submit");
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal((globalThis as any).window.location.hash, "");
    assert.ok(model.view.find('#auth-form [name="email"]'));
    assert.match(model.view.find("#toasts")?.textContent || "", /novo link/i);
  });

  test("mantém o link quando o POST falha apenas na complexidade da senha", async () => {
    (globalThis as any).fetch = async (input: string) => {
      const url = String(input);
      if (url.includes("/api/auth/redefinir-senha?")) {
        return { ok: true, status: 200, json: async () => ({ valid: true }) };
      }
      if (url.endsWith("/api/auth/redefinir-senha")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: "A senha deve conter ao menos uma letra maiúscula.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    model = createViewState(() => {});
    createCRMController(model);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const form = model.view.find("#auth-form")!;
    (form.find('[name="password"]') as any).value = SENHA;
    (form.find('[name="confirm"]') as any).value = SENHA;
    model.dispatch(form, "submit");
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal((globalThis as any).window.location.hash, `#redefinir=${TOKEN}`);
    assert.ok(model.view.find('#auth-form [name="password"]'));
    assert.match(
      model.view.find("#auth-form .error")?.textContent || "",
      /senha deve/i,
    );
  });
});
