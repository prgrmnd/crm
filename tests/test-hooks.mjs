// Hooks de resolução usados apenas pelo `node --test`.
// Permitem testar o código de produção sem trocar seus imports:
// - `next/server` -> `next/server.js` (o pacote não declara "exports" ESM);
// - `@/...` -> `src/...` (mesmo alias do tsconfig/Next.js).
const srcRoot = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }

  if (specifier.startsWith('@/')) {
    return nextResolve(new URL(specifier.slice(2), srcRoot).href, context);
  }

  return nextResolve(specifier, context);
}
