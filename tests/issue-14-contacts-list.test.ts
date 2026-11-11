import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import D from "./fixtures/seed.cjs";
import {
  filterContactsList,
  paginateContacts,
  exportContactsToCSV,
} from "../src/lib/contact-service.ts";
import { createViewState } from "../src/lib/view-state.js";
import { createCRMController } from "../src/lib/crm-controller.js";
import type { Contact, Payment } from "../src/types/crm.ts";

describe("Issue #14: Listagem de Contatos - Regras de Domínio e Estado", () => {
  let seedState: any;
  let allContacts: Contact[];
  let payments: Payment[];

  beforeEach(() => {
    seedState = D.seed();
    allContacts = seedState.contacts;
    payments = seedState.payments;
  });

  // Cenário 1 & 2: Abas de filtragem (Todos, Potenciais, Doadores)
  test("Cenários 1 e 2: Filtra contatos corretamente entre as abas Todos, Potenciais e Doadores", () => {
    const todos = filterContactsList(allContacts, { tab: "all" }, payments);
    assert.equal(todos.length, allContacts.length);

    const potenciais = filterContactsList(
      allContacts,
      { tab: "leads" },
      payments,
    );
    assert.ok(potenciais.length > 0);
    assert.ok(potenciais.every((c) => !c.plan));

    const doadores = filterContactsList(
      allContacts,
      { tab: "donors" },
      payments,
    );
    assert.ok(doadores.length > 0);
    assert.ok(doadores.every((c) => Boolean(c.plan)));

    assert.equal(potenciais.length + doadores.length, todos.length);
  });

  // Cenário 3: Aplicação dos filtros na busca
  test("Cenário 3: Aplicação correta de filtros (busca textual, origem, funil e status)", () => {
    // Busca por nome
    const porNome = filterContactsList(allContacts, { q: "Helena" }, payments);
    assert.ok(porNome.length > 0);
    assert.ok(porNome.every((c) => c.name.toLowerCase().includes("helena")));

    // Busca por origem
    const porOrigem = filterContactsList(
      allContacts,
      { origin: "Site" },
      payments,
    );
    assert.ok(porOrigem.length > 0);
    assert.ok(porOrigem.every((c) => c.origin === "Site"));

    // Busca por funil
    const porFunil = filterContactsList(
      allContacts,
      { funnel: "Inbound" },
      payments,
    );
    assert.ok(porFunil.length > 0);
    assert.ok(porFunil.every((c) => c.funnel.toLowerCase() === "inbound"));

    // Busca por status do doador
    const porStatus = filterContactsList(
      allContacts,
      { status: "Ativo" },
      payments,
    );
    assert.ok(porStatus.length > 0);
    assert.ok(porStatus.every((c) => c.plan?.status === "Ativo"));
  });

  // Cenário 4: Paginação no servidor
  test("Cenário 4: Paginação respeita parâmetros de página e tamanho de página", () => {
    const total = allContacts.length;
    const pageSize = 10;
    const pag1 = paginateContacts(allContacts, 1, pageSize);
    assert.equal(pag1.page, 1);
    assert.equal(pag1.pageSize, 10);
    assert.equal(pag1.total, total);
    assert.equal(pag1.totalPages, Math.ceil(total / pageSize));
    assert.equal(pag1.contacts.length, 10);
    assert.equal(pag1.contacts[0].id, allContacts[0].id);

    const pag2 = paginateContacts(allContacts, 2, pageSize);
    assert.equal(pag2.page, 2);
    assert.equal(pag2.contacts.length, 10);
    assert.equal(pag2.contacts[0].id, allContacts[10].id);

    const pag3 = paginateContacts(allContacts, 3, pageSize);
    assert.equal(pag3.page, 3);
    assert.equal(pag3.contacts.length, total - 20);
  });

  // Cenário 5: Preservação dos filtros durante a navegação
  test("Cenário 5: Preservação dos filtros durante a navegação entre páginas", () => {
    const params = { tab: "donors", pageSize: 3 };
    const filtered = filterContactsList(allContacts, params, payments);

    const pag1 = paginateContacts(filtered, 1, 3);
    const pag2 = paginateContacts(filtered, 2, 3);

    // Ambas as páginas mantêm apenas doadores
    assert.ok(pag1.contacts.every((c) => Boolean(c.plan)));
    assert.ok(pag2.contacts.every((c) => Boolean(c.plan)));
    assert.notDeepEqual(pag1.contacts, pag2.contacts);
  });

  // Cenários 6 e 7: Preservação e remoção da seleção entre páginas
  test("Cenários 6 e 7: Preservação da seleção entre páginas e remoção individual", () => {
    const selectedIds = new Set<string>();

    // Página 1: seleciona primeiro contato
    const pag1 = paginateContacts(allContacts, 1, 10);
    selectedIds.add(pag1.contacts[0].id);

    // Navega para página 2 e seleciona outro contato
    const pag2 = paginateContacts(allContacts, 2, 10);
    selectedIds.add(pag2.contacts[0].id);

    // Seleção preservada
    assert.equal(selectedIds.size, 2);
    assert.ok(selectedIds.has(pag1.contacts[0].id));
    assert.ok(selectedIds.has(pag2.contacts[0].id));

    // Remoção individual
    selectedIds.delete(pag1.contacts[0].id);
    assert.equal(selectedIds.size, 1);
    assert.ok(!selectedIds.has(pag1.contacts[0].id));
    assert.ok(selectedIds.has(pag2.contacts[0].id));
  });

  // Cenário 8: Seleção de todos os contatos da página atual
  test("Cenário 8: Seleção em lote de todos os contatos da página atual", () => {
    const selectedIds = new Set<string>();
    const pag1 = paginateContacts(allContacts, 1, 10);

    // Selecionar todos da página 1
    pag1.contacts.forEach((c) => selectedIds.add(c.id));
    assert.equal(selectedIds.size, 10);
    assert.ok(pag1.contacts.every((c) => selectedIds.has(c.id)));

    // Navega para página 2 sem perder seleção anterior
    const pag2 = paginateContacts(allContacts, 2, 10);
    assert.ok(pag1.contacts.every((c) => selectedIds.has(c.id)));

    // Desmarcar todos da página 1
    pag1.contacts.forEach((c) => selectedIds.delete(c.id));
    assert.equal(selectedIds.size, 0);
  });

  // Cenário 9: Exportação de contatos filtrados
  test("Cenário 9: Exportação CSV dos contatos filtrados gera estrutura e cabeçalhos corretos", () => {
    const donors = filterContactsList(allContacts, { tab: "donors" }, payments);
    const csv = exportContactsToCSV(donors, payments);

    // Verifica BOM UTF-8
    assert.ok(csv.startsWith("\uFEFF"));

    // Verifica cabeçalhos obrigatórios
    assert.ok(
      csv.includes(
        "Nome;Email;Telefone;Tipo;Origem;Funil;Etapa;Status;Identificação",
      ),
    );

    // Deve conter todos os doadores filtrados
    const lines = csv.trim().split("\r\n");
    assert.equal(lines.length, donors.length + 1); // +1 para o cabeçalho
  });

  // Cenário 10: Exportação de contatos selecionados
  test("Cenário 10: Exportação CSV selecionada inclui exclusivamente os contatos marcados", () => {
    const selectedList = [allContacts[0], allContacts[10]];
    const csv = exportContactsToCSV(selectedList, payments);

    const lines = csv.trim().split("\r\n");
    assert.equal(lines.length, 3); // Cabeçalho + 2 selecionados
    assert.ok(csv.includes(allContacts[0].name));
    assert.ok(csv.includes(allContacts[10].name));
    assert.ok(!csv.includes(allContacts[1].name));
  });

  // Cenário 11: Tratamento de lista vazia
  test("Cenário 11: Lista vazia é paginada corretamente com total zero", () => {
    const vazio = filterContactsList(
      allContacts,
      { q: "inexistente-xyz-123" },
      payments,
    );
    assert.equal(vazio.length, 0);

    const pag = paginateContacts(vazio, 1, 10);
    assert.equal(pag.total, 0);
    assert.equal(pag.page, 1);
    assert.equal(pag.totalPages, 1);
    assert.deepEqual(pag.contacts, []);
  });
});

describe("Issue #14: Interface do Usuário (Controller e ViewState)", () => {
  let originalLocalStorage: any;
  let originalFetch: any;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    originalFetch = globalThis.fetch;

    const storage: Record<string, string> = {
      "luz-crm-state": JSON.stringify(D.seed()),
    };

    globalThis.localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = String(v);
      },
      removeItem: (k: string) => {
        delete storage[k];
      },
      clear: () => {
        for (const k of Object.keys(storage)) delete storage[k];
      },
    } as any;
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
    globalThis.fetch = originalFetch;
  });

  test("Interface exibe as 3 abas de filtragem: Todos, Potenciais e Doadores", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        return {
          ok: true,
          json: async () => ({
            contacts: D.seed().contacts.slice(0, 10),
            total: 24,
            page: 1,
            pageSize: 10,
            totalPages: 3,
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const model = createViewState(() => {});
    createCRMController(model);

    // Aguarda inicialização
    await new Promise((r) => setTimeout(r, 50));

    // Navega para contatos
    const navBtn = model.view.find('[data-action="nav"][data-id="contacts"]');
    assert.ok(navBtn, "Botão de navegação para contatos deve existir");
    model.dispatch(navBtn, "click");
    await new Promise((r) => setTimeout(r, 50));

    // Verifica abas
    const tabTodos = model.view.find(
      '[data-action="contact-tab"][data-id="all"]',
    );
    const tabPotenciais = model.view.find(
      '[data-action="contact-tab"][data-id="leads"]',
    );
    const tabDoadores = model.view.find(
      '[data-action="contact-tab"][data-id="donors"]',
    );

    assert.ok(tabTodos, "Aba 'Todos' deve estar presente");
    assert.ok(tabPotenciais, "Aba 'Potenciais' deve estar presente");
    assert.ok(tabDoadores, "Aba 'Doadores' deve estar presente");

    assert.equal(tabTodos.textContent.trim(), "Todos");
    assert.equal(tabPotenciais.textContent.trim(), "Potenciais");
    assert.equal(tabDoadores.textContent.trim(), "Doadores");

    model.dispose();
  });

  test("Alternância entre abas altera a classe active e atualiza os contatos", async () => {
    let requestedTab = "";
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        const u = new URL(url, "http://localhost");
        requestedTab = u.searchParams.get("tab") || "";
        return {
          ok: true,
          json: async () => ({
            contacts: D.seed().contacts.slice(0, 10),
            total: 24,
            page: 1,
            pageSize: 10,
            totalPages: 3,
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const model = createViewState(() => {});
    createCRMController(model);
    await new Promise((r) => setTimeout(r, 50));

    // Navega para contatos
    model.dispatch(
      model.view.find('[data-action="nav"][data-id="contacts"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));

    // Clica em 'Potenciais'
    const tabPotenciais = model.view.find(
      '[data-action="contact-tab"][data-id="leads"]',
    );
    model.dispatch(tabPotenciais, "click");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(requestedTab, "leads");
    assert.ok(
      model.view
        .find('[data-action="contact-tab"][data-id="leads"]')
        .className.includes("active"),
    );

    // Clica em 'Doadores'
    const tabDoadores = model.view.find(
      '[data-action="contact-tab"][data-id="donors"]',
    );
    model.dispatch(tabDoadores, "click");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(requestedTab, "donors");
    assert.ok(
      model.view
        .find('[data-action="contact-tab"][data-id="donors"]')
        .className.includes("active"),
    );

    model.dispose();
  });

  test("Exibe estado de erro visual e permite tentar novamente", async () => {
    let callCount = 0;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 500,
            json: async () => ({
              error: "Falha de conexão com a API de contatos",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            contacts: D.seed().contacts.slice(0, 5),
            total: 5,
            page: 1,
            pageSize: 10,
            totalPages: 1,
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const model = createViewState(() => {});
    createCRMController(model);
    await new Promise((r) => setTimeout(r, 50));

    model.dispatch(
      model.view.find('[data-action="nav"][data-id="contacts"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));

    // Deve exibir aviso visual de erro
    const noticeError = model.view.find(".notice.red");
    assert.ok(noticeError, "Aviso de erro deve ser renderizado");
    assert.match(noticeError.textContent, /Falha de conexão com a API/);

    const retryBtn = model.view.find('[data-action="retry-contacts"]');
    assert.ok(
      retryBtn,
      "Botão Tentar novamente deve estar visível no estado de erro",
    );

    // Clica em Tentar novamente
    model.dispatch(retryBtn, "click");
    await new Promise((r) => setTimeout(r, 50));

    // Agora deve ter carregado com sucesso
    assert.ok(
      !model.view.find(".notice.red"),
      "Aviso de erro não deve mais estar visível",
    );
    assert.ok(
      model.view.find(".table-wrap table"),
      "Tabela deve ser exibida após retry",
    );

    model.dispose();
  });

  test("Exibe indicador de lista vazia quando nenhum resultado é retornado", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        return {
          ok: true,
          json: async () => ({
            contacts: [],
            total: 0,
            page: 1,
            pageSize: 10,
            totalPages: 1,
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const model = createViewState(() => {});
    createCRMController(model);
    await new Promise((r) => setTimeout(r, 50));

    model.dispatch(
      model.view.find('[data-action="nav"][data-id="contacts"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));

    // Deve exibir estado de lista vazia
    const emptyNotice = model.view.find(".empty");
    assert.ok(emptyNotice, "Elemento .empty deve ser renderizado");
    assert.match(emptyNotice.textContent, /Nenhum relacionamento encontrado/);

    model.dispose();
  });

  test("Ação select-page seleciona e desseleciona todos os contatos da página atual", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        return {
          ok: true,
          json: async () => ({
            contacts: D.seed().contacts.slice(0, 10),
            total: 24,
            page: 1,
            pageSize: 10,
            totalPages: 3,
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const model = createViewState(() => {});
    createCRMController(model);
    await new Promise((r) => setTimeout(r, 50));

    model.dispatch(
      model.view.find('[data-action="nav"][data-id="contacts"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));

    const selectPageCheckbox = model.view.find(
      'th [data-action="select-page"]',
    );
    assert.ok(
      selectPageCheckbox,
      "Checkbox select-page no cabeçalho deve existir",
    );

    // Marca todos da página atual
    selectPageCheckbox.checked = true;
    model.dispatch(selectPageCheckbox, "change");
    await new Promise((r) => setTimeout(r, 30));

    const countText = model.view.find(".selection-count")?.textContent;
    assert.match(countText || "", /10 selecionados/);

    // Desmarca todos da página atual
    const selectPageChecked = model.view.find('th [data-action="select-page"]');
    selectPageChecked.checked = false;
    model.dispatch(selectPageChecked, "change");
    await new Promise((r) => setTimeout(r, 30));

    const countTextAfter = model.view.find(".selection-count")?.textContent;
    assert.match(countTextAfter || "", /0 selecionados/);

    model.dispose();
  });

  test("Preserva a seleção ao navegar entre páginas do servidor", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        const u = new URL(url, "http://localhost");
        const page = Number(u.searchParams.get("page") || "1");
        const all = D.seed().contacts;
        return {
          ok: true,
          json: async () => ({
            contacts: all.slice((page - 1) * 10, page * 10),
            total: all.length,
            page,
            pageSize: 10,
            totalPages: Math.ceil(all.length / 10),
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const model = createViewState(() => {});
    createCRMController(model);
    await new Promise((r) => setTimeout(r, 50));

    model.dispatch(
      model.view.find('[data-action="nav"][data-id="contacts"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));

    const firstPageCheckbox = model.view.find(
      '[data-action="select-contact"][data-id="contact-0"]',
    );
    firstPageCheckbox.checked = true;
    model.dispatch(firstPageCheckbox, "change");
    await new Promise((r) => setTimeout(r, 30));

    model.dispatch(model.view.find('[data-action="next"]'), "click");
    await new Promise((r) => setTimeout(r, 50));

    const secondPageCheckbox = model.view.find(
      '[data-action="select-contact"][data-id="contact-10"]',
    );
    assert.ok(
      secondPageCheckbox,
      "Contato da segunda página deve estar visível",
    );
    secondPageCheckbox.checked = true;
    model.dispatch(secondPageCheckbox, "change");
    await new Promise((r) => setTimeout(r, 30));

    assert.match(
      model.view.find(".selection-count")?.textContent || "",
      /2 selecionados/,
    );

    model.dispose();
  });

  test("Exportação filtrada consulta a API com os filtros ativos", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        requests.push(url);
        if (url.includes("export=csv")) {
          return {
            ok: true,
            text: async () =>
              '\uFEFFNome;Email\r\n"Helena";"helena@exemplo.com"',
          };
        }
        return {
          ok: true,
          json: async () => ({
            contacts: D.seed().contacts.slice(0, 10),
            total: 24,
            page: 1,
            pageSize: 10,
            totalPages: 3,
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = (() => "blob:export") as any;
    URL.revokeObjectURL = (() => {}) as any;

    const model = createViewState(() => {});
    createCRMController(model);
    await new Promise((r) => setTimeout(r, 50));

    model.dispatch(
      model.view.find('[data-action="nav"][data-id="contacts"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));
    model.dispatch(
      model.view.find('[data-action="contact-tab"][data-id="leads"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));

    model.dispatch(model.view.find('[data-action="export-contacts"]'), "click");
    await new Promise((r) => setTimeout(r, 50));

    const exportUrl = requests
      .filter((url) => url.includes("export=csv"))
      .map((url) => new URL(url, "http://localhost"))
      .at(-1);
    assert.ok(exportUrl, "Exportação deve consultar a API");
    assert.equal(exportUrl.searchParams.get("tab"), "leads");
    assert.equal(exportUrl.searchParams.get("export"), "csv");
    assert.equal(exportUrl.searchParams.get("ids"), null);

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    model.dispose();
  });

  test("Exportação selecionada envia somente os IDs marcados de outras páginas", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: "admin",
              name: "Marina Costa",
              email: "marina@exemplo.com",
              profile: "administrador",
            },
          }),
        };
      }
      if (url.includes("/api/contacts")) {
        requests.push(url);
        const u = new URL(url, "http://localhost");
        if (u.searchParams.get("export") === "csv") {
          return {
            ok: true,
            text: async () =>
              '\uFEFFNome;Email\r\n"Helena";"helena@exemplo.com"',
          };
        }
        const page = Number(u.searchParams.get("page") || "1");
        const all = D.seed().contacts;
        return {
          ok: true,
          json: async () => ({
            contacts: all.slice((page - 1) * 10, page * 10),
            total: all.length,
            page,
            pageSize: 10,
            totalPages: Math.ceil(all.length / 10),
          }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = (() => "blob:export") as any;
    URL.revokeObjectURL = (() => {}) as any;

    const model = createViewState(() => {});
    createCRMController(model);
    await new Promise((r) => setTimeout(r, 50));

    model.dispatch(
      model.view.find('[data-action="nav"][data-id="contacts"]'),
      "click",
    );
    await new Promise((r) => setTimeout(r, 50));
    const firstPageCheckbox = model.view.find(
      '[data-action="select-contact"][data-id="contact-0"]',
    );
    firstPageCheckbox.checked = true;
    model.dispatch(firstPageCheckbox, "change");
    await new Promise((r) => setTimeout(r, 30));

    model.dispatch(model.view.find('[data-action="next"]'), "click");
    await new Promise((r) => setTimeout(r, 50));
    const secondPageCheckbox = model.view.find(
      '[data-action="select-contact"][data-id="contact-10"]',
    );
    secondPageCheckbox.checked = true;
    model.dispatch(secondPageCheckbox, "change");
    await new Promise((r) => setTimeout(r, 30));

    model.dispatch(model.view.find('[data-action="export-contacts"]'), "click");
    await new Promise((r) => setTimeout(r, 50));

    const exportUrl = requests
      .filter((url) => url.includes("export=csv"))
      .map((url) => new URL(url, "http://localhost"))
      .at(-1);
    assert.ok(exportUrl, "Exportação deve consultar a API");
    const ids = (exportUrl.searchParams.get("ids") || "").split(",");
    assert.deepEqual(ids.sort(), ["contact-0", "contact-10"]);

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    model.dispose();
  });
});
