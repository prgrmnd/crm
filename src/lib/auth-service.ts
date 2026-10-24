import argon2 from "argon2";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Prisma, PrismaClient } from "@/generated/prisma/client.ts";
import { getPrismaClient } from "@/lib/prisma.ts";
import { recordAuditEvent } from "@/lib/audit-service.ts";

const LOCK_LIMIT = 5;
const LOCK_DURATION_MS = 60_000;
export const SESSION_IDLE_LIMIT_MS = 30 * 60_000;
export const SESSION_COOKIE = "luz_crm_session";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  profile: "administrador" | "operador_captacao";
}

interface LoginResult {
  status: 200 | 401 | 429;
  user?: AuthenticatedUser;
  token?: string;
  retryAfter?: number;
}

const dummyHash = argon2.hash("not-a-real-user-password", {
  type: argon2.argon2id,
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestIp(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwardedIps = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim());
  const proxyIp = forwardedIps?.at(-1);
  return proxyIp && isIP(proxyIp) ? proxyIp : null;
}

function mapUser(user: {
  id: string;
  nome: string;
  email: string;
  perfil: string;
}): AuthenticatedUser {
  if (user.perfil !== "administrador" && user.perfil !== "operador_captacao") {
    throw new Error("Perfil de usuário persistido é inválido.");
  }
  return {
    id: user.id,
    name: user.nome,
    email: user.email,
    profile: user.perfil,
  };
}

async function auditLogin(
  transaction: Prisma.TransactionClient,
  userId: string | null,
  action: string,
  result: "sucesso" | "falha" | "bloqueado",
  correlationId: string,
) {
  await recordAuditEvent(
    {
      actorType: "sistema",
      action,
      entityType: "Autenticação",
      entityId: userId,
      correlationId,
      after: { resultado: result },
    },
    transaction,
  );
}

export async function authenticate(
  emailInput: string,
  password: string,
  headers: Headers,
  prisma: PrismaClient = getPrismaClient(),
): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  const identifierHash = sha256(email);
  const ip = requestIp(headers);
  const lockKey = `${identifierHash}:${ip ?? "sem-ip"}`;
  const correlationId = randomUUID();

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text
        AS lock_acquired
    `;

    const priorAttempts = await transaction.tentativaLogin.findMany({
      where: { identificadorHash: identifierHash, ip },
      orderBy: { criadoEm: "desc" },
      take: LOCK_LIMIT,
    });
    const latestAttempt = priorAttempts[0];
    const now = new Date();

    if (latestAttempt?.bloqueadoAte && latestAttempt.bloqueadoAte > now) {
      return {
        status: 429,
        retryAfter: Math.max(
          1,
          Math.ceil(
            (latestAttempt.bloqueadoAte.getTime() - now.getTime()) / 1000,
          ),
        ),
      };
    }

    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM usuarios
      WHERE lower(trim(email)) = ${email}
      LIMIT 1
    `;
    const account = rows[0]
      ? await transaction.usuario.findUnique({
          where: { id: rows[0].id },
        })
      : null;
    const passwordMatches = await argon2.verify(
      account?.senhaHash ?? (await dummyHash),
      password,
    );
    const authenticated = Boolean(account?.ativo && passwordMatches);

    if (authenticated && account) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now.getTime() + SESSION_IDLE_LIMIT_MS);
      await transaction.sessao.create({
        data: {
          usuarioId: account.id,
          tokenHash: sha256(token),
          expiraEm: expiresAt,
          ip,
          agenteUsuario: headers.get("user-agent")?.slice(0, 1000) ?? null,
        },
      });
      await transaction.tentativaLogin.create({
        data: {
          usuarioId: account.id,
          identificadorHash: identifierHash,
          ip,
          sucesso: true,
        },
      });
      await recordAuditEvent(
        {
          actorType: "usuario",
          actorId: account.id,
          action: "Login realizado",
          entityType: "Autenticação",
          entityId: account.id,
          correlationId,
          after: { resultado: "sucesso" },
        },
        transaction,
      );
      return { status: 200, user: mapUser(account), token };
    }

    let failureCount = 1;
    for (const attempt of priorAttempts) {
      if (attempt.sucesso || attempt.bloqueadoAte) break;
      failureCount++;
    }
    const lockedUntil =
      failureCount >= LOCK_LIMIT
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : null;

    await transaction.tentativaLogin.create({
      data: {
        usuarioId: account?.id ?? null,
        identificadorHash: identifierHash,
        ip,
        sucesso: false,
        bloqueadoAte: lockedUntil,
      },
    });
    await auditLogin(
      transaction,
      account?.id ?? null,
      lockedUntil ? "Login bloqueado" : "Falha no login",
      lockedUntil ? "bloqueado" : "falha",
      correlationId,
    );

    return lockedUntil
      ? { status: 429, retryAfter: Math.ceil(LOCK_DURATION_MS / 1000) }
      : { status: 401 };
  });
}

export async function getActiveSession(
  token: string | undefined,
  touch = false,
  prisma: PrismaClient = getPrismaClient(),
): Promise<AuthenticatedUser | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = sha256(token);

  return prisma.$transaction(async (transaction) => {
    const sessions = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM sessoes
      WHERE token_hash = ${tokenHash} AND revogada_em IS NULL
      FOR UPDATE
    `;
    const sessionId = sessions[0]?.id;
    if (!sessionId) return null;

    const session = await transaction.sessao.findUnique({
      where: { id: sessionId },
      include: { usuario: true },
    });
    if (!session) return null;

    const now = new Date();
    if (
      session.expiraEm <= now ||
      session.ultimoAcessoEm.getTime() <=
        now.getTime() - SESSION_IDLE_LIMIT_MS ||
      !session.usuario.ativo
    ) {
      await transaction.sessao.update({
        where: { id: session.id },
        data: {
          revogadaEm: new Date(
            Math.max(now.getTime(), session.criadoEm.getTime()),
          ),
        },
      });
      return null;
    }

    if (touch) {
      await transaction.$executeRaw`
        UPDATE sessoes
        SET ultimo_acesso_em = CURRENT_TIMESTAMP,
            expira_em = CURRENT_TIMESTAMP + (${SESSION_IDLE_LIMIT_MS} * INTERVAL '1 millisecond')
        WHERE id = ${session.id}
      `;
    }
    return mapUser(session.usuario);
  });
}

export async function revokeSession(
  token: string | undefined,
  prisma: PrismaClient = getPrismaClient(),
): Promise<void> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await prisma.sessao.updateMany({
    where: { tokenHash: sha256(token), revogadaEm: null },
    data: { revogadaEm: new Date() },
  });
}
