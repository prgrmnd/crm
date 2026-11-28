import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import D from "./fixtures/seed.cjs";

const defaultUrl = "http://127.0.0.1:3108";
const root = fileURLToPath(new URL("../", import.meta.url));

async function startServer(t) {
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
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverLog = "";
  let serverError;
  server.stdout.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.on("error", (error) => {
    serverError = error;
  });

  const closed = new Promise((resolve) => server.once("close", resolve));
  t.after(async () => {
    server.kill();
    await closed;
  });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (serverError || server.exitCode !== null || server.signalCode !== null)
      break;
    // A resposta HTTP confirma que o Next terminou de iniciar a aplicação.
    if (serverLog.includes("Ready in")) {
      const response = await fetch(defaultUrl, {
        signal: AbortSignal.timeout(1000),
      }).catch(() => null);
      await response?.body?.cancel();
      if (response?.ok) return defaultUrl;
    }
    await delay(100);
  }
  throw new Error(
    `Next indisponível em ${defaultUrl}.\n${serverError ?? serverLog}`,
  );
}

test("painel mostra a etapa de captação registrada na saída em desktop e mobile", async (t) => {
  const state = D.seed();
  const contact = state.contacts[8];
  const account = {
    id: "admin",
    name: "Marina Costa",
    email: "marina@exemplo.com",
    profile: "administrador",
  };
  contact.stage = 2;
  D.exitCadence(state, account, contact.id, {
    reason: "Sem retorno",
    date: D.today(),
  });
  contact.stage = 0;

  const [firstStageContact, missingStageContact, invalidStageContact] =
    state.contacts.slice(9, 12);
  for (const lossContact of [
    firstStageContact,
    missingStageContact,
    invalidStageContact,
  ]) {
    lossContact.stage = 0;
    D.exitCadence(state, account, lossContact.id, {
      reason: "Sem retorno",
      date: D.today(),
    });
  }
  delete missingStageContact.cadenceExit.stage;
  invalidStageContact.cadenceExit.stage = "length";

  const browserUrl = process.env.CRM_BROWSER_URL || (await startServer(t));
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : undefined),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.addInitScript((data) => {
      localStorage.setItem("luz-crm-v1", JSON.stringify(data));
    }, state);
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { user: account } }),
    );
    await page.route("**/api/users?*", (route) =>
      route.fulfill({ json: { users: [] } }),
    );
    await page.goto(browserUrl);
    await page.locator('[data-action="nav"][data-id="losses"]').click();

    const board = page.locator(".losses-kanban");
    const lossCard = (lossContact, stageName) =>
      board.getByRole("button", {
        name: `Ver detalhes de ${lossContact.name}. Última etapa de captação: ${stageName}`,
      });
    const card = lossCard(contact, "Consideração da solução");
    const expectedStages = [
      [contact, "Consideração da solução"],
      [firstStageContact, "Aprendizado e descoberta"],
      [missingStageContact, "Não informada"],
      [invalidStageContact, "Não informada"],
    ];

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [lossContact, stageName] of expectedStages) {
        const captureStage = lossCard(lossContact, stageName).locator(
          ".loss-capture-stage",
        );
        await captureStage.waitFor({ state: "visible" });
        assert.equal(
          await captureStage.textContent(),
          `Última etapa de captação${stageName}`,
        );
      }
      assert.equal(await board.locator(".column:visible").count(), 5);
      assert.equal(await board.locator(".compact-empty:visible").count(), 4);
    }

    const reasonFilter = page.locator('select[name="lossReason"]');
    await reasonFilter.selectOption("Outros");
    await card.waitFor({ state: "detached" });
    await reasonFilter.selectOption("Sem retorno");
    await card.waitFor({ state: "visible" });
    await card.focus();
    await card.press("Enter");
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: contact.name })
      .waitFor();
  } finally {
    await browser.close();
  }
});
