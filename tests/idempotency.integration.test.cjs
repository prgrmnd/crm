const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { testWithDatabase } = require("./helpers/postgres-test.cjs");

testWithDatabase(
  "[PB-071] idempotência armazena e reproduz respostas com segurança concorrente",
  async () => {
    const { withIdempotency } =
      await import("../src/lib/idempotency-service.ts");
    const { getPrismaClient } = await import("../src/lib/prisma.ts");
    const prisma = getPrismaClient();
    const userId = randomUUID();
    const operation = "POST:/api/commands/test";

    await prisma.usuario.create({
      data: {
        id: userId,
        nome: "Usuário de teste idempotência",
        email: `${userId}@example.test`,
        senhaHash:
          "$argon2id$v=19$m=65536,t=3,p=4$12345678901$1234567890123456",
        perfil: "administrador",
      },
    });

    const request = (key, payload) =>
      new Request("http://localhost/api/commands/test", {
        method: "POST",
        headers: { "idempotency-key": key },
        body: payload,
      });

    try {
      const key = randomUUID();
      const payload = JSON.stringify({ valor: 125 });
      let executions = 0;
      const handler = async () => {
        executions += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return Response.json(
          { resultado: "concluido", execucoes: executions },
          { status: 201 },
        );
      };

      const [firstResponse, repeatedResponse] = await Promise.all([
        withIdempotency(request(key, payload), { userId, operation }, handler),
        withIdempotency(request(key, payload), { userId, operation }, handler),
      ]);

      assert.equal(firstResponse.status, 201);
      assert.equal(repeatedResponse.status, 201);
      assert.equal(executions, 1);
      assert.deepEqual(await repeatedResponse.json(), {
        resultado: "concluido",
        execucoes: 1,
      });

      const stored = await prisma.requisicaoIdempotente.findUnique({
        where: {
          usuarioId_operacao_chave: {
            usuarioId: userId,
            operacao: operation,
            chave: key,
          },
        },
      });
      assert.ok(stored);
      assert.equal(
        stored.hashRequisicao,
        createHash("sha256").update(payload).digest("hex"),
      );
      assert.equal(stored.estado, "concluida");
      assert.equal(stored.resposta.status, 201);

      const mismatchedResponse = await withIdempotency(
        request(key, JSON.stringify({ valor: 126 })),
        { userId, operation },
        handler,
      );
      assert.equal(mismatchedResponse.status, 409);
      assert.equal(executions, 1);

      const retryKey = randomUUID();
      await assert.rejects(
        withIdempotency(
          request(retryKey, payload),
          { userId, operation },
          async () => {
            throw new Error("Falha simulada");
          },
        ),
        /Falha simulada/,
      );
      assert.equal(
        await prisma.requisicaoIdempotente.count({
          where: { usuarioId: userId, chave: retryKey },
        }),
        0,
      );
    } finally {
      await prisma.requisicaoIdempotente.deleteMany({
        where: { usuarioId: userId },
      });
      await prisma.usuario.delete({ where: { id: userId } });
    }
  },
);
