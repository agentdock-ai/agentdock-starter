import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { cloneAgentEvent, type AgentEvent } from "@agentdock-ai/contracts";
import { httpError } from "./schemas.ts";

interface Thread {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

const threadFields =
  'id, title, created_at AS "createdAt", updated_at AS "updatedAt"';
const attachmentFields = 'id, name, mime_type AS "mimeType", size, data';

export function createRepository(pool: Pool, ownerId: string) {
  return {
    async health() {
      await pool.query("SELECT 1");
    },
    async listThreads() {
      const result = await pool.query<Thread>(
        `SELECT ${threadFields} FROM agentdock_demo_threads
         WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 100`,
        [ownerId],
      );
      return result.rows;
    },
    async createThread() {
      const result = await pool.query<Thread>(
        `INSERT INTO agentdock_demo_threads (id, owner_id)
         VALUES ($1, $2) RETURNING ${threadFields}`,
        [randomUUID(), ownerId],
      );
      return result.rows[0];
    },
    async requireThread(id: string) {
      const result = await pool.query<Thread>(
        `SELECT ${threadFields} FROM agentdock_demo_threads WHERE id = $1 AND owner_id = $2`,
        [id, ownerId],
      );
      if (!result.rows[0]) throw httpError(404, "Thread not found.");
      return result.rows[0];
    },
    async setTitle(id: string, message: string) {
      const title = message.trim().replace(/\s+/g, " ").slice(0, 64);
      if (title)
        await pool.query(
          `UPDATE agentdock_demo_threads SET title = $1
         WHERE id = $2 AND owner_id = $3 AND title = 'New thread'`,
          [title, id, ownerId],
        );
    },
    async touchThread(id: string) {
      await pool.query(
        "UPDATE agentdock_demo_threads SET updated_at = now() WHERE id = $1 AND owner_id = $2",
        [id, ownerId],
      );
    },
    async loadEvents(id: string) {
      const result = await pool.query<{ event: unknown }>(
        "SELECT event FROM agentdock_demo_events WHERE thread_id = $1 ORDER BY sequence",
        [id],
      );
      return result.rows.map((row) => cloneAgentEvent(row.event));
    },
    async saveEvent(id: string, event: AgentEvent) {
      await pool.query(
        `INSERT INTO agentdock_demo_events (thread_id, event_id, event)
         VALUES ($1, $2, $3::jsonb) ON CONFLICT (thread_id, event_id) DO NOTHING`,
        [id, event.eventId, JSON.stringify(event)],
      );
    },
    async listAttachments(threadId: string) {
      const result = await pool.query<Attachment>(
        `SELECT ${attachmentFields} FROM agentdock_demo_attachments WHERE thread_id = $1 AND owner_id = $2`,
        [threadId, ownerId],
      );
      return result.rows;
    },
    async loadAttachments(threadId: string, ids: string[]) {
      if (!ids.length) return [];
      const unique = [...new Set(ids)];
      const result = await pool.query<Attachment>(
        `SELECT ${attachmentFields} FROM agentdock_demo_attachments
         WHERE thread_id = $1 AND owner_id = $2 AND id = ANY($3::uuid[])`,
        [threadId, ownerId, unique],
      );
      if (result.rows.length !== unique.length)
        throw httpError(
          400,
          "An attachment is missing or belongs to another thread.",
        );
      // Keep the order chosen by the user, rather than database row order.
      const byId = new Map(result.rows.map((item) => [item.id, item]));
      return unique.map((id) => byId.get(id)!);
    },
    async createAttachment(threadId: string, file: Omit<Attachment, "id">) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO agentdock_demo_attachments (id, thread_id, owner_id, name, mime_type, size, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, threadId, ownerId, file.name, file.mimeType, file.size, file.data],
      );
      return id;
    },
    async requireAttachment(id: string) {
      const result = await pool.query<Attachment>(
        `SELECT ${attachmentFields} FROM agentdock_demo_attachments WHERE id = $1 AND owner_id = $2`,
        [id, ownerId],
      );
      if (!result.rows[0]) throw httpError(404, "Attachment not found.");
      return result.rows[0];
    },
  };
}
