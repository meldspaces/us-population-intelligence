import "dotenv/config";
import pg from "pg";
import { serverLog } from "./logger.js";

const { Pool } = pg;

function requiredDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

export const pool = new Pool({
  connectionString: requiredDatabaseUrl(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

pool.on("error", (err: Error) => {
  serverLog("error", "Unexpected Postgres pool error", { error: err.message });
});

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
