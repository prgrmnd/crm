import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

test("CSS, logo e referência do protótipo são cópias byte a byte do inventário", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../source-manifest.json", import.meta.url)),
  );
  for (const [source, target] of [
    ["styles.css", "src/app/globals.css"],
    ["favicon.png", "public/favicon.png"],
    ["app.js", "tests/fixtures/prototype-app.cjs"],
  ]) {
    const bytes = fs.readFileSync(new URL("../" + target, import.meta.url));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      manifest[source].sha256,
      target,
    );
    assert.equal(bytes.length, manifest[source].bytes);
  }
});
