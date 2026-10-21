import { test } from "node:test";
import assert from "node:assert/strict";
import { createViewState } from "../src/lib/view-state.js";

test("presentation state handles form values, disabled fields and persistent modal state without a browser DOM", async () => {
  let revisions = 0;
  const model = createViewState(() => revisions++);
  const { view, runtime } = model;
  model.modal.showModal();
  model.modal.markup =
    '<form id="form"><input name="name" value="João"><select name="origin"><option value="Site" selected>Site</option><option value="Evento">Evento</option></select><input disabled name="ignored" value="x"><input type="checkbox" name="yes" checked><input type="checkbox" name="no"><textarea name="body">A &amp; B</textarea></form>';
  assert.equal(model.modal.open, true);
  const form = view.find("#form");
  assert.deepEqual(Object.fromEntries(runtime.formEntries(form)), {
    name: "João",
    origin: "Site",
    yes: "on",
    body: "A & B",
  });
  form.find("[name=origin]").value = "Evento";
  assert.equal(Object.fromEntries(runtime.formEntries(form)).origin, "Evento");
  model.modal.classList.toggle("wide", true);
  assert.equal(model.modal.className, "wide");
  await Promise.resolve();
  assert.ok(revisions > 0);
  model.dispose();
});

test("local React event handler can stop the global action handler; timers stop on unmount", async () => {
  const model = createViewState(() => {}),
    calls = [];
  model.app.markup = '<button data-action="save">Salvar</button>';
  const button = model.app.find("button");
  button.onclick = (e) => {
    calls.push("local");
    e.stopPropagation();
  };
  model.view.on("click", () => calls.push("global"));
  model.dispatch(button, "click");
  assert.deepEqual(calls, ["local"]);
  model.runtime.timeout(() => calls.push("timer"), 5);
  model.dispose();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(calls, ["local"]);
});
