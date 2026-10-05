import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";

export async function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  const checkpointer = new PostgresSaver(pool);
  const close = () => pool.end();
  try {
    await checkpointer.setup();
    await pool.query(`
    CREATE TABLE IF NOT EXISTS agentdock_demo_threads (
      id uuid PRIMARY KEY,
      owner_id text NOT NULL,
      title text NOT NULL DEFAULT 'New thread',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS agentdock_demo_threads_owner_updated
      ON agentdock_demo_threads (owner_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS agentdock_demo_events (
      sequence bigserial PRIMARY KEY,
      thread_id uuid NOT NULL REFERENCES agentdock_demo_threads(id) ON DELETE CASCADE,
      event_id text NOT NULL,
      event jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (thread_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS agentdock_demo_attachments (
      id uuid PRIMARY KEY,
      thread_id uuid NOT NULL REFERENCES agentdock_demo_threads(id) ON DELETE CASCADE,
      owner_id text NOT NULL,
      name text NOT NULL,
      mime_type text NOT NULL,
      size integer NOT NULL,
      data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  } catch (error) {
    await close();
    throw error;
  }
  return { pool, checkpointer, close };
}
