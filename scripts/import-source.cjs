// One-time provenance import. The delivered application never reads its parent.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const dest = path.resolve(__dirname, '..');
for (const dir of ['src/lib','src/app','public','tests/fixtures']) fs.mkdirSync(path.join(dest, dir), {recursive:true});
for (const [from,to] of [['styles.css','src/app/globals.css'],['domain.js','src/lib/domain.cjs'],['favicon.png','public/favicon.png']]) fs.copyFileSync(path.join(root,from),path.join(dest,to));
const files = ['index.html','styles.css','app.js','domain.js','favicon.png'];
fs.writeFileSync(path.join(dest,'source-manifest.json'), JSON.stringify(Object.fromEntries(files.map(name => [name, {sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),bytes:fs.statSync(path.join(root,name)).size}])), null, 2)+'\n');
let source = fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/^'use strict';\r?\n/,'');
source = source.replace("const D=CRM,KEY=", "const KEY=");
source = source.replace('const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];', () => 'const $=(s,r=view)=>r.find(s),$$=(s,r=view)=>r.findAll(s);');
source = source.replaceAll('document.documentElement','view.documentElement').replaceAll('document.activeElement','view.activeElement');
source = source.replaceAll('document.createElement(', 'view.createElement(');
source = source.replaceAll('document.addEventListener(', 'view.on(');
source = source.replaceAll('.innerHTML', '.markup');
source = source.replaceAll('.addEventListener(', '.on(');
source = source.replaceAll('window.on(', 'runtime.onWindow(');
source = source.replace("matchMedia('(prefers-color-scheme: dark)').on(", 'runtime.onMedia(');
// The XML query in the Excel parser is intentionally the native DOMParser API.
source = source.replaceAll("doc.querySelectorAll('button,.filters,.page-heading')", "doc.findAll('button,.filters,.page-heading')");
source = source.replaceAll("results.querySelectorAll('input')", "results.findAll('input')");
source = source.replaceAll('new FormData(', 'runtime.formEntries(');
source = source.replaceAll('setTimeout(', 'runtime.timeout(').replaceAll('setInterval(', 'runtime.interval(');
// Window listeners also publish React presentation state after external events.
source = source.replace('init();', 'init().finally(model.changed);');
source = 'import D from "./domain.cjs";\n\nexport function createCRMController(model) {\nconst {view,runtime}=model;\n'+source+'\n}\n';
if (/\bdocument\s*\./.test(source)) throw Error('Unexpected browser document reference in migrated controller');
fs.writeFileSync(path.join(dest,'src/lib/crm-controller.js'),source);
// Preserve the original reference for the existing VM-based regression tests.
// It is test data only, never served or executed by the application.
fs.copyFileSync(path.join(root,'app.js'),path.join(dest,'tests/fixtures/prototype-app.cjs'));
for (const name of ['domain','automation','adjustments','email']) {
  let test=fs.readFileSync(path.join(root,'tests',name+'.test.js'),'utf8');
  test=test.replaceAll("require('../domain')", "require('../src/lib/domain.cjs')").replaceAll("require.resolve('../app.js')", "require.resolve('./fixtures/prototype-app.cjs')");
  fs.writeFileSync(path.join(dest,'tests',name+'.test.cjs'),test);
}
console.log('Imported immutable assets/domain and migrated presentation controller.');
