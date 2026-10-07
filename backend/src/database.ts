import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { Pool } from "pg";
import type { ConversationFileStorage } from "@agentdock-ai/conversations";
import { createPostgresConversationStore } from "@agentdock-ai/conversations";

export async function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  const checkpointer = new PostgresSaver(pool);
  const nativeStore = PostgresStore.fromConnString(connectionString, {
    schema: "agentdock_store",
    ttl: { refreshOnRead: false, sweepIntervalMinutes: 60 },
  });
  const close = async () => {
    await nativeStore.stop();
    await pool.end();
  };
  const fileStorage: ConversationFileStorage = {
    async put({ id, bytes }) {
      await pool.query(
        `INSERT INTO agentdock_conversation_files (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [id, Buffer.from(bytes)],
      );
      return id;
    },
    async get(reference) {
      const result = await pool.query<{ data: Buffer }>(
        "SELECT data FROM agentdock_conversation_files WHERE id = $1",
        [reference],
      );
      return result.rows[0]?.data ?? null;
    },
    async delete(reference) {
      await pool.query(
        "DELETE FROM agentdock_conversation_files WHERE id = $1",
        [reference],
      );
    },
  };
  try {
    await checkpointer.setup();
    await nativeStore.setup();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agentdock_conversation_files (
        id text PRIMARY KEY,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const store = await createPostgresConversationStore(
      nativeStore,
      pool,
      "agentdock_store",
    );
    return { pool, checkpointer, store, fileStorage, close };
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
}
