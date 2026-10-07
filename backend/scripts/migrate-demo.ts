import { Pool } from "pg";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { InMemoryStore } from "@langchain/langgraph-checkpoint";
import { migrateDemoConversations } from "./migration/demo-conversations.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("Set DATABASE_URL to the database being rehearsed.");
const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString });
const store = apply
  ? PostgresStore.fromConnString(connectionString, {
      schema: "agentdock_store",
      ttl: { refreshOnRead: false, sweepIntervalMinutes: 60 },
    })
  : new InMemoryStore();
const fileStorage = {
  async put({
    id,
    bytes,
  }: {
    id: string;
    mimeType: string;
    bytes: Uint8Array;
  }) {
    await pool.query(
      `INSERT INTO agentdock_conversation_files (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [id, Buffer.from(bytes)],
    );
    return id;
  },
  async get(reference: string) {
    const result = await pool.query<{ data: Buffer }>(
      "SELECT data FROM agentdock_conversation_files WHERE id = $1",
      [reference],
    );
    return result.rows[0]?.data ?? null;
  },
  async delete(reference: string) {
    await pool.query("DELETE FROM agentdock_conversation_files WHERE id = $1", [
      reference,
    ]);
  },
};
try {
  if (store instanceof PostgresStore) await store.setup();
  if (apply) {
    await pool.query(`CREATE TABLE IF NOT EXISTS agentdock_conversation_files (
      id text PRIMARY KEY, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  const report = await migrateDemoConversations({
    pool,
    store,
    fileStorage,
    apply,
  });
  console.info(
    JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }, null, 2),
  );
} finally {
  if (store instanceof PostgresStore) await store.stop();
  await pool.end();
}
