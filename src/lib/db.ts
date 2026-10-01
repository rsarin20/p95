import "server-only";
import { SCHEMA_SQL } from "./schema";

// One tiny query interface over two drivers:
//  - Production: real Postgres (Neon / Supabase / RDS…) via DATABASE_URL.
//  - Local dev & tests: PGlite, an embedded Postgres that needs no install.
// All SQL is written once, in plain Postgres, against `q()`.

type Row = Record<string, unknown>;
type Driver = { query: (text: string, params: unknown[]) => Promise<Row[]> };

const g = globalThis as unknown as { __walktoberDb?: Promise<Driver> };

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  let driver: Driver;
  if (url) {
    const { default: postgres } = await import("postgres");
    // prepare:false keeps us compatible with transaction-mode poolers (Neon, Supabase, PgBouncer).
    const sql = postgres(url, { max: Number(process.env.DB_POOL_MAX || 5), prepare: false, idle_timeout: 20 });
    driver = { query: (text, params) => sql.unsafe(text, params as never[]) as unknown as Promise<Row[]> };
  } else {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMBEDDED_DB !== "true") {
      throw new Error("DATABASE_URL is not set. Add a Postgres connection string before launching.");
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
    if (dir !== "memory") (await import("node:fs")).mkdirSync(dir, { recursive: true });
    const pg = dir === "memory" ? new PGlite() : new PGlite(dir);
    driver = { query: async (text, params) => (await pg.query<Row>(text, params)).rows };
  }
  await runSchema(driver);
  return driver;
}

async function runSchema(driver: Driver) {
  // Statements are idempotent (IF NOT EXISTS) so this is safe on every cold start.
  for (const stmt of SCHEMA_SQL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await driver.query(stmt, []);
  }
}

function db(): Promise<Driver> {
  if (!g.__walktoberDb) {
    g.__walktoberDb = createDriver().catch((e) => {
      g.__walktoberDb = undefined;
      throw e;
    });
  }
  return g.__walktoberDb;
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await (await db()).query(text, params)) as T[];
}

export async function q1<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}
