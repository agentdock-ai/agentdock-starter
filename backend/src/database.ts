import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { Pool } from "pg";
import type { ConversationFileStorage } from "@agentdock-ai/conversations";
import {
  createPostgresConversationFileStorage,
  createPostgresConversationStore,
} from "@agentdock-ai/conversations";

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
  try {
    await checkpointer.setup();
    await nativeStore.setup();
    const fileStorage: ConversationFileStorage =
      await createPostgresConversationFileStorage(pool);
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
