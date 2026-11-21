import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prefere conexão direta (unpooled) do Neon para migrations; faz fallback para DATABASE_URL.
const databaseUrl =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  "postgresql://localhost:5432/postgres";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
