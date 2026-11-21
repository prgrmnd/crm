const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/lib/domain.cjs");

const KEY = "luz-crm-v1";
const admin = {
  id: "admin",
  name: "Admin",
  email: "admin@exemplo.com",
  role: "Administrador",
  active: true,
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const DUPLICATE_MESSAGE = /Já existe um contato com este e-mail ou CPF\/CNPJ\./;

let globals, models;

beforeEach(() => {
  globals = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
  };
  models = [];
});

afterEach(() => {
  for (const model of models) model.dispose();
  globalThis.window = globals.window;
  globalThis.localStorage = globals.localStorage;
  globalThis.fetch = globals.fetch;
});

function baseState() {
  const s = D.createEmptyState();
  s.users = [
    { ...admin },
    {
      id: "operator",
      name: "Operador",
      email: "operador@exemplo.com",
      role: "Operador de Captação",
      active: true,
    },
  ];
  D.ensureAutomations(s);
  D.ensureExtensions(s);
  return s;
}

function existingContact(extra = {}) {
  return {
    id: "contato-existente",
    name: "Pessoa Existente",
    email: "pessoa@exemplo.com",
    phone: "86999999999",
    document: "52998224725",
    type: "PF",
    origin: "WhatsApp",
    funnel: "Inbound",
    stage: 1,
    owner: "admin",
    created: "2026-01-01T12:00:00.000Z",
    history: [
      {
        id: "evento-antigo",
        action: "Contato cadastrado",
        at: "2026-01-01T12:00:00.000Z",
        actor: "admin",
        actorName: "Admin",
        details: "WhatsApp · Inbound",
      },
    ],
    optOut: false,
    ...extra,
  };
}

function contactData(extra = {}) {
  return {
    name: "Nova Pessoa",
    email: "nova@exemplo.com",
    phone: "",
    document: "",
    type: "PF",
    origin: "Indicação",
    funnel: "Inbound",
    stage: 0,
    ...extra,
  };
}

function activateIntake(s) {
  const rule = D.saveIntake(s, admin, {
    name: "Entrada do site",
    origin: "Site",
    direction: "Inbound",
    stage: 2,
    owner: "admin",
    listId: "",
    taskText: "",
    days: 0,
  });
  D.activateIntake(s, admin, rule.id, true);
}

function activateEmails(s) {
  for (const event of ["registered", "stage"]) {
    const rule = D.saveAutomation(s, admin, {
      name: `Regra ${event}`,
      event,
      origin: "",
      direction: "",
      stage: "",
      delayMinutes: 0,
      subject: "Olá {{nome}}",
      body: "Mensagem para {{nome}}",
    });
    D.setAutomationActive(s, admin, rule.id, true);
  }
}

async function boot(state) {
  const storage = { [KEY]: JSON.stringify(state) };
  globalThis.localStorage = {
    getItem: (key) => storage[key] ?? null,
    setItem: (key, value) => {
      storage[key] = String(value);
    },
    removeItem: (key) => {
      delete storage[key];
    },
    clear: () => {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  };
  globalThis.window = {
    location: { hash: "" },
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    if (url.includes("/api/auth/session"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            profile: "administrador",
          },
        }),
      };
    if (url.includes("/api/users")) {
      const saved = JSON.parse(storage[KEY]);
      return {
        ok: true,
        status: 200,
        json: async () => ({ users: saved.users }),
      };
    }
    if (url.includes("/api/contacts")) {
      const saved = JSON.parse(storage[KEY]);
      const idMatch = url.match(/\/api\/contacts\/([^/?#]+)/);
      if (method === "POST" && !idMatch) {
        const body = JSON.parse(init.body || "{}");
        const created = {
          id: D.uid(),
          name: body.name,
          email: String(body.email || "").trim(),
          phone: body.phone || "",
          document: body.document || "",
          type: body.type || "PF",
          origin: body.origin,
          funnel: D.inboundOnly(body.origin) ? "Inbound" : body.funnel,
          stage: Number(body.stage ?? 0),
          owner: body.owner || admin.id,
          ownerName: saved.users.find((u) => u.id === (body.owner || admin.id))?.name || admin.name,
          version: 1,
          created: new Date().toISOString(),
          history: [],
          optOut: false,
        };
        saved.contacts.unshift(created);
        D.audit(saved, admin, "Contato cadastrado", created.id, `${created.origin} · ${created.funnel}`);
        storage[KEY] = JSON.stringify(saved);
        return { ok: true, status: 201, json: async () => ({ contact: created }) };
      }
      if (method === "PATCH" && idMatch) {
        const targetId = idMatch[1];
        const body = JSON.parse(init.body || "{}");
        const existing = saved.contacts.find((c) => c.id === targetId);
        if (!existing) return { ok: false, status: 404, json: async () => ({ error: "Contato não encontrado." }) };
        if (existing.origin !== body.origin || existing.funnel !== body.funnel) {
          D.audit(
            saved,
            admin,
            "Origem e direção alteradas",
            targetId,
            `${existing.origin} / ${existing.funnel} → ${body.origin} / ${body.funnel}`,
          );
        }
        Object.assign(existing, {
          name: body.name ?? existing.name,
          email: body.email !== undefined ? String(body.email).trim() : existing.email,
          phone: body.phone ?? existing.phone,
          document: body.document ?? existing.document,
          type: body.type ?? existing.type,
          origin: body.origin ?? existing.origin,
          funnel: body.funnel ?? existing.funnel,
          owner: body.owner ?? existing.owner,
          version: (existing.version || 1) + 1,
        });
        D.audit(saved, admin, "Cadastro atualizado", targetId);
        storage[KEY] = JSON.stringify(saved);
        return { ok: true, status: 200, json: async () => ({ contact: existing }) };
      }
      if (method === "GET" && idMatch) {
        const targetId = idMatch[1];
        const existing = saved.contacts.find((c) => c.id === targetId);
        if (!existing) return { ok: false, status: 404, json: async () => ({ error: "Contato não encontrado." }) };
        return { ok: true, status: 200, json: async () => ({ contact: existing }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          contacts: saved.contacts,
          total: saved.contacts.length,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const { createViewState } = await import("../src/lib/view-state.js");
  const { createCRMController } = await import("../src/lib/crm-controller.js");
  const model = createViewState(() => {});
  models.push(model);
  createCRMController(model);
  await tick();
  model.dispatch(
    model.view.find('[data-action="nav"][data-id="contacts"]'),
    "click",
  );
  await tick();
  return { model, storage, state: () => JSON.parse(storage[KEY]) };
}

function openNew(model) {
  const button = model.view.find('[data-action="contact"]');
  assert.ok(button, "A tela de contatos deve oferecer novo cadastro");
  model.dispatch(button, "click");
}

async function openEdit(model, id) {
  model.dispatch(
    model.view.find(`[data-action="profile"][data-id="${id}"]`),
    "click",
  );
  await tick();
  model.dispatch(
    model.view.find(`[data-action="contact"][data-id="${id}"]`),
    "click",
  );
}

function fillStepOne(model, values) {
  const form = model.view.find("#modal-form");
  assert.ok(form, "A primeira etapa do formulário deve estar aberta");
  assert.match(form.markup, /1 de 2/);
  for (const [name, value] of Object.entries(values))
    form.find(`[name="${name}"]`).value = value;
  return form;
}

async function submit(model, form) {
  model.dispatch(form, "submit");
  await tick();
}

function stepTwo(model) {
  const form = model.view.find("#modal-form");
  assert.ok(form, "A segunda etapa do formulário deve estar aberta");
  assert.match(form.markup, /2 de 2/);
  return form;
}

async function fillStepTwo(model, values) {
  const form = stepTwo(model);
  for (const [name, value] of Object.entries(values)) {
    const input = form.find(`[name="${name}"]`);
    input.value = value;
    model.dispatch(input, "change");
  }
  return form;
}

async function createFromForm(model, data, origin) {
  openNew(model);
  await submit(model, fillStepOne(model, data));
  const form = await fillStepTwo(model, { origin });
  await submit(model, form);
}

test("origem Site ou Instagram só aceita Inbound nas regras de domínio", () => {
  for (const origin of D.INBOUND_ONLY_ORIGINS)
    assert.throws(
      () => D.validateContact(contactData({ origin, funnel: "Outbound" }), [], ""),
      /devem ser Inbound/,
    );
  for (const origin of D.INBOUND_ONLY_ORIGINS)
    assert.doesNotThrow(() =>
      D.validateContact(contactData({ origin, funnel: "Inbound" }), [], ""),
    );
  assert.doesNotThrow(() =>
    D.validateContact(
      contactData({ origin: "WhatsApp", funnel: "Outbound" }),
      [],
      "",
    ),
  );
});

test("duplicidade compara e-mail sem caixa/espaços e documento por dígitos", () => {
  const s = baseState();
  const c = existingContact();
  s.contacts.push(c, {
    id: "sem-dados",
    name: "Sem dados",
    email: "",
    document: "",
    history: [],
  });

  assert.throws(
    () =>
      D.validateContact(
        contactData({ email: "  PESSOA@exemplo.com  " }),
        s.contacts,
        "novo",
      ),
    DUPLICATE_MESSAGE,
  );
  assert.throws(
    () =>
      D.validateContact(
        contactData({ document: "529.982.247-25" }),
        s.contacts,
        "novo",
      ),
    DUPLICATE_MESSAGE,
  );
  assert.doesNotThrow(() =>
    D.validateContact(
      contactData({ email: c.email, document: c.document }),
      s.contacts,
      c.id,
    ),
  );
  assert.throws(
    () =>
      D.validateContact(contactData({ email: c.email }), s.contacts, "outro"),
    DUPLICATE_MESSAGE,
  );
  assert.throws(
    () =>
      D.validateContact(
        contactData({ document: c.document }),
        s.contacts,
        "outro",
      ),
    DUPLICATE_MESSAGE,
  );
  assert.doesNotThrow(() =>
    D.validateContact(contactData(), s.contacts, "novo"),
  );
});

test("formulário mantém duas etapas, volta preservando dados e fixa Inbound", async () => {
  const { model, state } = await boot(baseState());

  openNew(model);
  const first = fillStepOne(model, {
    name: "Maria do Site",
    email: "maria@exemplo.com",
    phone: "86988887777",
  });
  await submit(model, first);

  let second = await fillStepTwo(model, { origin: "Site" });
  const funnel = second.find('[name="funnel"]');
  assert.equal(funnel.value, "Inbound");
  assert.equal(funnel.disabled, true);

  model.dispatch(second.find("[data-action=contact-back]"), "click");
  await tick();
  const back = model.view.find("#modal-form");
  assert.match(back.markup, /1 de 2/);
  assert.equal(back.find('[name="name"]').value, "Maria do Site");
  assert.equal(back.find('[name="email"]').value, "maria@exemplo.com");

  await submit(model, back);
  second = stepTwo(model);
  assert.equal(second.find('[name="origin"]').value, "Site");
  second.find('[name="funnel"]').value = "Outbound";
  await submit(model, second);

  const created = state().contacts.find((c) => c.email === "maria@exemplo.com");
  assert.ok(created);
  assert.equal(created.origin, "Site");
  assert.equal(created.funnel, "Inbound");
  assert.equal(
    created.history.filter((e) => e.action === "Contato cadastrado").length,
    1,
  );
});

test("Instagram também força Inbound e origem sem regra mantém a escolha", async () => {
  const { model, state } = await boot(baseState());

  await createFromForm(
    model,
    { name: "Ana Instagram", email: "ana@exemplo.com" },
    "Instagram",
  );
  assert.equal(
    state().contacts.find((c) => c.email === "ana@exemplo.com").funnel,
    "Inbound",
  );

  openNew(model);
  await submit(
    model,
    fillStepOne(model, { name: "João WhatsApp", email: "joao@exemplo.com" }),
  );
  const form = await fillStepTwo(model, {
    origin: "WhatsApp",
    funnel: "Outbound",
  });
  assert.equal(form.find('[name="funnel"]').disabled, false);
  await submit(model, form);
  assert.equal(
    state().contacts.find((c) => c.email === "joao@exemplo.com").funnel,
    "Outbound",
  );
});

test("trocar de origem fixa restaura a classificação manual anterior", async () => {
  const s = baseState();
  const contact = existingContact({ origin: "Indicação", funnel: "Outbound" });
  s.contacts.push(contact);
  const { model } = await boot(s);

  await openEdit(model, contact.id);
  await submit(model, fillStepOne(model, {}));
  const form = stepTwo(model);
  const origin = form.find('[name="origin"]');
  const funnel = form.find('[name="funnel"]');
  assert.equal(origin.value, "Indicação");
  assert.equal(funnel.value, "Outbound");
  assert.equal(funnel.disabled, false);

  for (const [next, expected, disabled] of [
    ["Site", "Inbound", true],
    ["WhatsApp", "Outbound", false],
    ["Instagram", "Inbound", true],
    ["E-mail", "Outbound", false],
  ]) {
    origin.value = next;
    model.dispatch(origin, "change");
    assert.equal(funnel.disabled, disabled);
    assert.equal(funnel.value, expected);
  }
});

test("duplicidade de e-mail e documento bloqueia a primeira etapa com mensagem clara", async () => {
  const s = baseState();
  s.contacts.push(existingContact());
  const { model } = await boot(s);

  openNew(model);
  const form = fillStepOne(model, {
    name: "Duplicado",
    email: "  PESSOA@exemplo.com  ",
  });
  await submit(model, form);
  assert.match(model.view.find("#modal-form .error").textContent, DUPLICATE_MESSAGE);
  assert.match(model.view.find("#modal-form").markup, /1 de 2/);

  form.find('[name="email"]').value = "novo@exemplo.com";
  form.find('[name="document"]').value = "529.982.247-25";
  await submit(model, form);
  assert.match(model.view.find("#modal-form .error").textContent, DUPLICATE_MESSAGE);
  assert.match(model.view.find("#modal-form").markup, /1 de 2/);
});

test("edição preserva etapa e dados não cadastrais sem repetir pós-cadastro", async () => {
  const s = baseState();
  activateIntake(s);
  activateEmails(s);
  const original = existingContact({
    plan: { mode: "Pontual", amount: 250, since: "2026-01", status: "Ativo" },
  });
  s.contacts.push(original);
  s.payments.push({
    id: "pagamento-antigo",
    contactId: original.id,
    amount: 250,
    date: "2026-01-10",
    period: "2026-01",
    destination: "Obras sociais",
  });

  const { model, state } = await boot(s);

  await createFromForm(
    model,
    { name: "Carla Site", email: "carla@exemplo.com" },
    "Site",
  );
  const afterCreation = state();
  assert.equal(afterCreation.intakeRuns.length, 1);
  assert.equal(
    afterCreation.automationRuns.filter((r) => r.event.type === "registered")
      .length,
    1,
  );
  const runCounts = {
    intake: afterCreation.intakeRuns.length,
    automation: afterCreation.automationRuns.length,
  };

  await openEdit(model, original.id);
  const editForm = model.view.find("#modal-form");
  assert.match(editForm.markup, /1 de 2/);
  assert.equal(editForm.find('[name="email"]').value, original.email);

  await submit(
    model,
    fillStepOne(model, {
      name: "Pessoa Atualizada",
      email: "pessoa.nova@exemplo.com",
      phone: "86977776666",
    }),
  );
  const second = await fillStepTwo(model, { origin: "Indicação" });
  assert.match(second.markup, /Etapa atual/);
  assert.equal(second.find('[name="stage"]'), null);
  await submit(model, second);

  const saved = state();
  const edited = saved.contacts.find((c) => c.id === original.id);
  assert.equal(edited.name, "Pessoa Atualizada");
  assert.equal(edited.email, "pessoa.nova@exemplo.com");
  assert.equal(edited.phone, "86977776666");
  assert.equal(edited.origin, "Indicação");
  assert.equal(edited.stage, original.stage);
  assert.equal(edited.optOut, original.optOut);
  assert.equal(edited.created, original.created);
  assert.deepEqual(edited.plan, original.plan);
  assert.deepEqual(saved.payments, s.payments);
  assert.ok(
    edited.history.some((e) => e.id === "evento-antigo"),
    "O histórico anterior deve ser preservado",
  );

  const actions = edited.history.map((e) => e.action);
  assert.equal(actions.filter((a) => a === "Cadastro atualizado").length, 1);
  assert.equal(actions.filter((a) => a === "Contato cadastrado").length, 1);
  assert.equal(actions.filter((a) => a === "Etapa alterada").length, 0);
  assert.ok(actions.includes("Origem e direção alteradas"));
  assert.equal(saved.intakeRuns.length, runCounts.intake);
  assert.equal(saved.automationRuns.length, runCounts.automation);
});
