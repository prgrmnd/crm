export const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const MAX_CHAVES = 10000;

type Contador = { total: number; expiraEm: number };

const contadores = new Map<string, Contador>();

function limparExpirados(agora: number) {
  for (const [chave, contador] of contadores) {
    if (contador.expiraEm <= agora) contadores.delete(chave);
  }
}

function registrar(chave: string, agora: number): boolean {
  if (contadores.size > MAX_CHAVES) limparExpirados(agora);

  const atual = contadores.get(chave);
  if (!atual || atual.expiraEm <= agora) {
    contadores.set(chave, { total: 1, expiraEm: agora + JANELA_MS });
    return true;
  }

  atual.total += 1;
  return atual.total <= LIMITE_TENTATIVAS;
}

export function permitirTentativa(ip: string, email: string, agora = Date.now()): boolean {
  const porIp = registrar(`ip:${ip}`, agora);
  const porEmail = registrar(`email:${email}`, agora);
  return porIp && porEmail;
}

export function limparRateLimit() {
  contadores.clear();
}