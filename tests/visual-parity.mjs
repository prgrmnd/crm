import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { PNG } = require(
  path.join(root, "node_modules/playwright-core/lib/utilsBundle.js"),
);
function pixelDifference(a, b) {
  const x = PNG.sync.read(a),
    y = PNG.sync.read(b);
  assert.equal(x.width, y.width);
  assert.equal(x.height, y.height);
  let pixels = 0,
    maxDelta = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    let different = false;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(x.data[i + c] - y.data[i + c]);
      maxDelta = Math.max(maxDelta, delta);
      different ||= delta !== 0;
    }
    if (different) pixels++;
  }
  return { pixels, maxDelta };
}
const prototype = process.env.PROTOTYPE_ROOT || path.resolve(root, "..");
const output = path.join(root, "test-results", "visual");
fs.mkdirSync(output, { recursive: true });
const services = [
  spawn(process.execPath, ["server.js"], {
    cwd: prototype,
    env: { ...process.env, PORT: "3109" },
    windowsHide: true,
    stdio: "ignore",
  }),
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3110",
    ],
    { cwd: root, windowsHide: true, stdio: "ignore" },
  ),
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  for (const port of [3109, 3110])
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
      } catch {}
      if (i === 99) throw Error("Servidor indisponível: " + port);
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
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "light",
  });
  // Same clock, state and session in both implementations; different origins
  // keep writes from one version from affecting the other during comparisons.
  await context.addInitScript(() => {
    const NativeDate = Date,
      fixed = new NativeDate("2026-10-20T15:00:00-03:00").getTime();
    globalThis.Date = class extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixed]));
      }
      static now() {
        return fixed;
      }
    };
  });
  const original = await context.newPage(),
    next = await context.newPage();
  await original.goto("http://127.0.0.1:3109");
  await original.locator("#auth-form").waitFor();
  const state = await original.evaluate(() =>
    localStorage.getItem("luz-crm-prototype-v1"),
  );
  await next.goto("http://127.0.0.1:3110");
  await next.locator("#auth-form").waitFor();
  for (const page of [original, next])
    await page.evaluate((state) => {
      localStorage.setItem("luz-crm-prototype-v1", state);
      sessionStorage.setItem(
        "luz-crm-session-v1",
        JSON.stringify({ id: "admin", last: Date.now() }),
      );
    }, state);
  const results = [];
  const metrics = (page, selector = "#app *") =>
    page.evaluate(
      (selector) =>
        [...document.querySelectorAll(selector)].map((el) => {
          const r = el.getBoundingClientRect(),
            s = getComputedStyle(el);
          return {
            tag: el.tagName,
            id: el.id,
            class: el.getAttribute("class"),
            text: el.children.length ? null : el.textContent,
            rect: [r.x, r.y, r.width, r.height].map(
              (v) => Math.round(v * 100) / 100,
            ),
            style: [
              s.display,
              s.position,
              s.color,
              s.backgroundColor,
              s.fontFamily,
              s.fontSize,
              s.fontWeight,
              s.padding,
              s.margin,
              s.border,
              s.gap,
              s.gridTemplateColumns,
              s.overflow,
              s.transition,
            ],
            label: el.getAttribute("aria-label"),
            title: el.getAttribute("title"),
            placeholder: el.getAttribute("placeholder"),
          };
        }),
      selector,
    );
  for (const width of process.env.ONLY_DIALOGS ? [] : [1440, 1000, 390])
    for (const theme of ["light", "dark"]) {
      for (const page of [original, next]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.evaluate(
          (theme) => localStorage.setItem("luz-crm-theme", theme),
          theme,
        );
        await page.reload();
        await page.locator("main").waitFor();
      }
      for (const screen of [
        "dashboard",
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
        for (const page of [original, next]) {
          // Navigation in the original is internal and has no URL transition.
          await page
            .locator(`.nav-item[data-id="${screen}"]`)
            .evaluate((el) => el.click());
          await sleep(180);
          await page.evaluate(() => scrollTo(0, 0));
        }
        const name = `${width}-${theme}-${screen}`;
        const before = await metrics(original),
          after = await metrics(next);
        try {
          assert.deepEqual(after, before);
        } catch (error) {
          fs.writeFileSync(
            path.join(output, name + "-metrics.json"),
            JSON.stringify({ before, after }, null, 2),
          );
          throw error;
        }
        const a = await original.screenshot(),
          b = await next.screenshot();
        const exact = a.equals(b);
        if (!exact) {
          fs.writeFileSync(path.join(output, name + "-original.png"), a);
          fs.writeFileSync(path.join(output, name + "-react.png"), b);
        }
        results.push({
          width,
          theme,
          screen,
          elements: before.length,
          metricsEqual: true,
          pngEqual: exact,
        });
      }
      console.log(
        `OK: ${width}px / ${theme}: 11 telas, geometria, estilos, textos e atributos`,
      );
    }
  if (results.length)
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify(results, null, 2),
    );
  const dialogs = [];
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      for (const page of [original, next]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.evaluate(
          (theme) => localStorage.setItem("luz-crm-theme", theme),
          theme,
        );
        await page.reload();
        await page.locator("main").waitFor();
        await page
          .locator('.nav-item[data-id="contacts"]')
          .evaluate((el) => el.click());
      }
      for (const [operation, id] of [
        ["profile", "contact-0"],
        ["contact", ""],
        ["move", "contact-8"],
        ["convert", "contact-8"],
        ["interaction", "contact-8"],
        ["response", "contact-8"],
        ["donor-status", "contact-0"],
        ["payment", "contact-0"],
        ["adherence", "contact-0"],
      ]) {
        for (const page of [original, next]) {
          await page
            .locator('[data-action=profile][data-id="contact-0"]')
            .first()
            .evaluate((el) => el.click());
          await sleep(80);
          if (operation !== "profile") {
            // Some actions belong to a lead rather than a donor.
            if (
              ["move", "convert", "interaction", "response"].includes(operation)
            ) {
              await page
                .locator("#modal [data-action=close]")
                .first()
                .evaluate((el) => el.click());
              await sleep(80);
              await page
                .locator('[data-action=profile][data-id="contact-8"]')
                .first()
                .evaluate((el) => el.click());
              await sleep(80);
            }
            if (operation === "contact" && id === "") {
              await page
                .locator("#modal [data-action=close]")
                .first()
                .evaluate((el) => el.click());
              await page
                .locator('[data-action=contact][data-id=""]')
                .evaluate((el) => el.click());
            } else {
              const target = page
                .locator(`#modal [data-action="${operation}"][data-id="${id}"]`)
                .first();
              if (!(await target.count()))
                throw Error(
                  `${width}/${theme}/${operation}/${page.url()}: ${await page.locator("#modal").textContent()}`,
                );
              await target.evaluate((el) => el.click());
            }
          }
          await sleep(100);
        }
        assert.deepEqual(
          await metrics(next, "#modal,#modal *"),
          await metrics(original, "#modal,#modal *"),
        );
        const a = await original.screenshot(),
          b = await next.screenshot(),
          exact = a.equals(b);
        const difference = pixelDifference(a, b);
        assert.ok(
          difference.maxDelta <= 1,
          `${width}/${theme}/${operation}: raster delta ${difference.maxDelta}`,
        );
        if (!exact) {
          fs.writeFileSync(
            path.join(output, `${width}-${theme}-${operation}-original.png`),
            a,
          );
          fs.writeFileSync(
            path.join(output, `${width}-${theme}-${operation}-react.png`),
            b,
          );
        }
        dialogs.push({
          width,
          theme,
          operation,
          metricsEqual: true,
          pngEqual: exact,
          ...difference,
        });
        for (const page of [original, next])
          await page
            .locator("#modal [data-action=close]")
            .first()
            .evaluate((el) => el.click());
        await sleep(80);
      }
    }
  fs.writeFileSync(
    path.join(output, "dialogs.json"),
    JSON.stringify(dialogs, null, 2),
  );
  console.log(
    `${dialogs.length} comparações de modais; ${dialogs.filter((r) => r.pngEqual).length} PNGs exatamente iguais.`,
  );
  const logins = [];
  for (const width of [1440, 1000, 390])
    for (const theme of ["light", "dark"]) {
      for (const page of [original, next]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.evaluate((theme) => {
          sessionStorage.clear();
          localStorage.setItem("luz-crm-theme", theme);
        }, theme);
        await page.reload();
        await page.locator("#auth-form").waitFor();
      }
      assert.deepEqual(await metrics(next), await metrics(original));
      const exact = (await original.screenshot()).equals(
        await next.screenshot(),
      );
      assert.ok(exact, `Login: ${width}/${theme}`);
      logins.push({ width, theme, metricsEqual: true, pngEqual: exact });
    }
  fs.writeFileSync(
    path.join(output, "logins.json"),
    JSON.stringify(logins, null, 2),
  );
  console.log(`${logins.length} comparações de login exatamente iguais.`);
  console.log(
    `${results.length} comparações; ${results.filter((r) => r.pngEqual).length} capturas PNG exatamente iguais.`,
  );
} finally {
  await browser?.close();
  services.forEach((p) => p.kill());
}
