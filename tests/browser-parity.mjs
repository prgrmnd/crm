import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "test-results");
fs.mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3108",
  ],
  { cwd: root, windowsHide: true, stdio: "pipe" },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
let browser;
const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const action = (a, id) =>
  `[data-action="${a}"]${id === undefined ? "" : `[data-id="${id}"]`}`;
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch("http://127.0.0.1:3108")).ok) break;
    } catch {}
    if (n === 99) throw Error(serverLog);
    await sleep(100);
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    colorScheme: "light",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("http://127.0.0.1:3108");
  await page.locator("#auth-form").waitFor();
  await page.screenshot({ path: path.join(output, "login.png") });
  const click = async (a, id) => {
    await page.locator(action(a, id)).first().click({ timeout: 10000 });
    await sleep(60);
  };
  const submit = async (values = {}) => {
    for (const [name, value] of Object.entries(values)) {
      const field = page.locator(`#modal-form [name="${name}"]`);
      if (await field.evaluate((el) => el.tagName === "SELECT"))
        await field.selectOption(String(value));
      else await field.fill(String(value));
    }
    await page.locator("#modal-form button[type=submit]").click();
    await sleep(100);
    const error = await page.evaluate(
      () => document.querySelector("#modal-form .error")?.textContent,
    );
    assert.ok(!error, error);
  };
  await click("demo", "admin");
  await page.locator("main").waitFor();
  assert.match(await page.locator("h1").textContent(), /Bom dia, Marina/);
  await page.screenshot({ path: path.join(output, "dashboard.png") });
  for (const screen of [
    "funnel",
    "losses",
    "contacts",
    "donors",
    "lists",
    "emails",
    "finance",
    "reports",
    "users",
    "audit",
  ]) {
    await click("nav", screen);
    assert.ok(await page.locator("h1").textContent());
  }
  results.push("11 telas e login de administrador");
  await click("nav", "funnel");
  assert.equal(await page.locator(".compact-card").count(), 16);
  await click("funnel-view", "list");
  assert.equal(await page.locator(".funnel-list tbody tr").count(), 16);
  await click("funnel-view", "board");
  const dragged = await page
    .locator(".compact-card")
    .first()
    .getAttribute("data-contact");
  await page
    .locator(".compact-card")
    .first()
    .dragTo(page.locator('.column[data-stage="2"]'));
  assert.equal(
    await page
      .locator(`.column[data-stage="2"] [data-contact="${dragged}"]`)
      .count(),
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await click("funnel-stage", "3");
  assert.equal(await page.locator(".column:visible").count(), 1);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: path.join(output, "funnel-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1050 });
  results.push("funil, lista, arraste e layout móvel");
  await click("nav", "contacts");
  await click("select-contact", "contact-0");
  await click("next");
  await click("select-contact", "contact-10");
  assert.match(
    await page.locator(".selection-count").textContent(),
    /2 selecionados/,
  );
  await click("bulk-email");
  assert.equal(
    await page
      .locator('[data-action=email-pick][data-id="contact-22"]')
      .isDisabled(),
    true,
  );
  await submit({
    subject: "Mensagem React",
    body: "Obrigado por caminhar com a nossa causa.",
  });
  await submit();
  await click("email-activate-local");
  assert.match(await page.locator("main").textContent(), /Mensagem React/);
  results.push(
    "seleção entre páginas, bloqueio opt-out, composição/revisão/ativação",
  );
  await click("nav", "contacts");
  await click("contact", "");
  await submit({
    name: "Pessoa React",
    email: "pessoa-react@exemplo.com",
    document: "529.982.247-25",
  });
  await submit({ origin: "Site" });
  assert.match(await page.locator("#modal").textContent(), /Pessoa React/);
  const contactId = await page
    .locator("#modal [data-action=convert]")
    .getAttribute("data-id");
  await click("interaction", contactId);
  await submit({ summary: "Conversa registrada em React." });
  assert.match(
    await page.locator("#modal").textContent(),
    /Conversa registrada em React/,
  );
  await click("convert", contactId);
  await submit({ amount: "175" });
  assert.match(
    await page.locator("#modal").textContent(),
    /Compromisso de contribuição/,
  );
  await click("close");
  await click("profile", contactId);
  await click("payment", contactId);
  await submit();
  await submit({ pix: "PIX-REACT-1" });
  assert.match(
    await page.locator("#modal").textContent(),
    /Obrigado por espalhar esperança/,
  );
  const pdf = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
  });
  assert.ok(pdf.length > 1000);
  await click("receipt-email");
  await submit();
  await click("receipt-send-local");
  await click("close");
  await click("profile", contactId);
  await click("delete-contact", contactId);
  assert.match(
    await page.locator("#modal").textContent(),
    /histórico financeiro/,
  );
  await click("close");
  results.push(
    "cadastro, máscaras, interação, conversão, doação, recibo, PDF, envio e bloqueio de exclusão",
  );
  await click("nav", "lists");
  await click("list-detail", "list-1");
  await click("import", "list-1");
  await page.locator("#modal input[type=file]").setInputFiles({
    name: "contatos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "nome;email;telefone\nImportado React;importado-react@exemplo.com;86999990000\nDuplicado;importado-react@exemplo.com;\nInválido;sem-email;",
    ),
  });
  await submit();
  assert.match(
    await page.locator("#modal").textContent(),
    /1 importados · 1 duplicados · 1 inválidos/,
  );
  await click("close");
  results.push("importação CSV com duplicados e inválidos");
  const data = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("luz-crm-prototype-v1")),
    );
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await click("list-detail", "list-1");
  await click("import", "list-1");
  await page
    .locator("#modal input[type=file]")
    .setInputFiles(path.join(root, "tests/fixtures/contatos-excel.xlsx"));
  await submit();
  assert.match(await page.locator("#modal").textContent(), /1 importados/);
  await click("close");
  assert.ok(
    (await data()).contacts.some((c) => c.email === "excel@exemplo.com"),
  );
  await click("list-detail", "list-1");
  await click("list-contacts", "list-1");
  await page.locator("#list-all").check();
  await page.locator("#modal [name=q]").fill("sem resultado");
  assert.match(
    await page.locator(".selection-summary").textContent(),
    /fora do resultado atual/,
  );
  await submit();
  await click("close");
  results.push(
    "Excel .xlsx comprimido e seleção de lista preservada ao filtrar",
  );

  await click("nav", "emails");
  await click("email-tab", "automations");
  await click("automation-new");
  await submit({ name: "Regra React", event: "registered", origin: "Site" });
  await submit({
    subject: "Olá {{nome}}",
    body: "Uma mensagem para {{nome}}.",
    delay: "0",
  });
  await click("automation-activate");
  assert.equal(
    (await data()).automations.find((r) => r.name === "Regra React").active,
    true,
  );
  await click("intake-new");
  await submit({ name: "Entrada React", origin: "Site", stage: "2" });
  await submit({
    owner: "admin",
    listId: "list-2",
    taskText: "Ligar para novo contato",
    days: "2",
  });
  await click("intake-activate");
  await click("nav", "contacts");
  await click("contact", "");
  await submit({ name: "Pessoa Pós-cadastro", email: "pos-react@exemplo.com" });
  await submit({ origin: "Site", stage: "0" });
  let after = await data();
  const intakeContact = after.contacts.find(
    (c) => c.email === "pos-react@exemplo.com",
  );
  assert.equal(intakeContact.stage, 2);
  assert.ok(
    after.tasks.some((t) => t.contactId === intakeContact.id && t.intakeRunId),
  );
  assert.ok(
    after.automationRuns.some(
      (r) => r.contactId === intakeContact.id && r.status === "simulated",
    ),
  );
  assert.match(
    await page.locator("#modal").textContent(),
    /Resultado do pós-cadastro/,
  );
  await click("cadence-exit", intakeContact.id);
  await submit({ reason: "Outros", note: "Teste da saída", date: today });
  await click("loss-move", intakeContact.id);
  await submit({
    lossStage: "2",
    followUpDate: today,
    note: "Agendamento de retomada",
  });
  assert.equal(
    (await data()).contacts.find((c) => c.id === intakeContact.id).cadenceExit
      .lossStage,
    2,
  );
  await click("cadence-resume", intakeContact.id);
  await submit({ stage: "1", reason: "Retomada de teste" });
  assert.ok(
    !(await data()).contacts.find((c) => c.id === intakeContact.id).cadenceExit,
  );
  await click("close");
  results.push(
    "automação por cadastro, pós-cadastro, tarefa, perda, agenda e retomada",
  );

  await click("nav", "contacts");
  await click("profile", contactId);
  await click("donor-status", contactId);
  await submit({
    status: "Suspenso",
    date: today,
    reason: "Suspensão de teste",
  });
  await click("payment", contactId);
  await submit({ amount: "1" });
  await page
    .locator("#modal [name=attachment]")
    .setInputFiles(path.join(root, "public/favicon.png"));
  await submit();
  assert.equal(
    (await data()).contacts.find((c) => c.id === contactId).plan.status,
    "Suspenso",
  );
  const downloadPromise = page.waitForEvent("download");
  await click("attachment");
  assert.equal((await downloadPromise).suggestedFilename(), "favicon.png");
  await click("close");
  results.push(
    "suspensão, recebimento com anexo e download sem reativação indevida",
  );

  await click("nav", "emails");
  await click("email-new");
  await click("email-pick", "contact-8");
  await page.locator("#modal [name=kind]").selectOption("recurring");
  await page.locator("#modal [name=frequency]").selectOption("monthly");
  assert.equal(await page.locator("#email-month-week-field").isVisible(), true);
  await submit({
    subject: "Mensal React",
    body: "Envio mensal",
    kind: "recurring",
    frequency: "monthly",
    weekday: "5",
    monthWeek: "-1",
  });
  await submit();
  await click("email-activate-local");
  after = await data();
  let mailing = after.mailings.find((m) => m.subject === "Mensal React");
  assert.equal(mailing.monthWeek, -1);
  await click("email-detail", mailing.id);
  await click("email-simulate", mailing.id);
  await click("close");
  assert.ok((await data()).mailingRuns.some((r) => r.mailingId === mailing.id));
  await click("email-pause", mailing.id);
  await click("email-review", mailing.id);
  await click("email-activate-local");
  await click("email-cancel", mailing.id);
  await click("email-cancel-local");
  assert.equal(
    (await data()).mailings.find((m) => m.id === mailing.id).status,
    "cancelled",
  );
  await click("email-tab", "history");
  assert.match(await page.locator("main").textContent(), /Mensal React/);
  await click("nav", "reports");
  await click("report-pdf");
  assert.ok(await page.locator(".print-report table").count());
  assert.ok(
    (await page.pdf({ printBackground: true, preferCSSPageSize: true }))
      .length > 1000,
  );
  await click("close");
  results.push(
    "recorrência mensal, simulação, pausa/retomada, cancelamento, histórico e PDF de relatório",
  );

  await click("theme");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.reload();
  await page.locator("main").waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  results.push("persistência de dados, sessão e tema após recarga");
  await click("logout");
  await click("demo", "operator");
  await page.locator("main").waitFor();
  for (const screen of ["dashboard", "reports", "users", "audit"])
    assert.equal(
      await page.locator(`.nav-item[data-id="${screen}"]`).count(),
      0,
    );
  results.push("perfil operador e menus restritos");
  await click("logout");
  await click("recover");
  await submit({ email: "operador@luz.exemplo" });
  await click("reset-link");
  await page.locator("#auth-form [name=confirm]").waitFor();
  await page.locator("#auth-form [name=password]").fill("NovaSenha@2026");
  await page.locator("#auth-form [name=confirm]").fill("NovaSenha@2026");
  await page.locator("#auth-form button[type=submit]").click();
  await page.locator("#auth-form [name=email]").waitFor();
  await page.locator("#auth-form [name=email]").fill("operador@luz.exemplo");
  await page.locator("#auth-form [name=password]").fill("NovaSenha@2026");
  await page.locator("#auth-form button[type=submit]").click();
  await page.locator("main").waitFor();
  results.push("recuperação por hash, redefinição e login com a nova senha");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "browser-results.json"),
    JSON.stringify({ passed: results, errors }, null, 2),
  );
  console.log(results.map((r) => "OK: " + r).join("\n"));
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
