import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { coerceMessageLikeToMessage } from "@langchain/core/messages";
import { createHash } from "node:crypto";
import {
  AgentEventType,
  cloneAgentEvent,
  cloneJsonValue,
  cloneJsonObject,
  createAgentReducerState,
  reduceAgentEvent,
  type ConversationMessage,
  type ContentPart,
  type ToolCallRecord,
} from "@agentdock-ai/contracts";
import type { Pool } from "pg";
import type {
  ConversationFileStorage,
  ConversationStore,
  ThreadRecord,
} from "@agentdock-ai/conversations";
import { ConversationRecords } from "@agentdock-ai/conversations";

interface LegacyThread {
  id: string;
  owner_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}
interface LegacyEvent {
  event: unknown;
}
interface LegacyAttachment {
  id: string;
  thread_id: string;
  owner_id: string;
  name: string;
  mime_type: string;
  size: number;
  data: Buffer;
  created_at: Date;
}

export interface MigrationReport {
  threads: number;
  messages: number;
  attachments: number;
  skippedExisting: number;
}

/** Explicit one-way import. It never updates or deletes legacy rows/checkpoints. */
export async function migrateDemoConversations(input: {
  pool: Pool;
  store: ConversationStore;
  fileStorage: ConversationFileStorage;
  apply: boolean;
}): Promise<MigrationReport> {
  const saver = new PostgresSaver(input.pool);
  const threads = await input.pool.query<LegacyThread>(
    `SELECT id::text, owner_id, title, created_at, updated_at FROM agentdock_demo_threads ORDER BY created_at, id`,
  );
  const attachmentRows = await input.pool.query<LegacyAttachment>(
    `SELECT id::text, thread_id::text, owner_id, name, mime_type, size, data, created_at FROM agentdock_demo_attachments ORDER BY created_at, id`,
  );
  const report: MigrationReport = {
    threads: 0,
    messages: 0,
    attachments: 0,
    skippedExisting: 0,
  };
  const migratedThreads = new Set<string>();
  for (const row of threads.rows) {
    const records = new ConversationRecords(input.store, row.owner_id);
    const existing = await records.getThread(row.id);
    if (existing) {
      if (
        existing.title !== row.title ||
        existing.createdAt !== row.created_at.toISOString()
      )
        throw new Error(
          `Conversation ${row.id} already exists with different migration data.`,
        );
      report.skippedExisting++;
    }
    const ownedAttachmentIds = new Set(
      attachmentRows.rows
        .filter(
          (attachment) =>
            attachment.thread_id === row.id &&
            attachment.owner_id === row.owner_id,
        )
        .map((attachment) => attachment.id),
    );
    const history = await readLegacyHistory(
      input.pool,
      row.id,
      ownedAttachmentIds,
      saver,
    );
    const thread: ThreadRecord = {
      id: row.id,
      title: row.title,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      ownerHash: createHash("sha256").update(row.owner_id).digest("hex"),
      nextPosition: history.messages.length,
      nextTurn: history.turnCount,
      lastOperation: history.operations.at(-1) ?? null,
      revision: 0,
    };
    if (
      existing &&
      (existing.nextPosition !== thread.nextPosition ||
        existing.lastOperation?.id !== thread.lastOperation?.id)
    )
      throw new Error(
        `Conversation ${row.id} has changed since import; do not overwrite live data.`,
      );
    if (input.apply && !existing) await records.putThread(thread);
    migratedThreads.add(JSON.stringify([row.owner_id, row.id]));
    if (input.apply) {
      for (const message of history.messages)
        await records.putMessage(row.id, message);
      for (const operation of history.operations)
        await records.putOperation(row.id, operation);
    }
    report.threads++;
    report.messages += history.messages.length;
  }
  for (const attachment of attachmentRows.rows) {
    const records = new ConversationRecords(input.store, attachment.owner_id);
    const thread = await records.getThread(attachment.thread_id);
    if (
      !thread &&
      !migratedThreads.has(
        JSON.stringify([attachment.owner_id, attachment.thread_id]),
      )
    )
      continue;
    const previous = await records.getAttachment(
      attachment.thread_id,
      attachment.id,
    );
    if (previous) {
      if (
        previous.size !== attachment.size ||
        previous.name !== attachment.name
      )
        throw new Error(
          `Attachment ${attachment.id} already exists with different migration data.`,
        );
      report.skippedExisting++;
      continue;
    }
    if (!/^image\/(png|jpeg|gif|webp)$/.test(attachment.mime_type))
      throw new Error(
        `Attachment ${attachment.id} has an unsupported MIME type.`,
      );
    if (attachment.data.byteLength !== attachment.size)
      throw new Error(
        `Attachment ${attachment.id} failed its byte length check.`,
      );
    if (input.apply) {
      const storageRef = await input.fileStorage.put({
        id: attachment.id,
        mimeType: attachment.mime_type as
          "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        bytes: attachment.data,
      });
      await records.putAttachment(attachment.thread_id, {
        id: attachment.id,
        threadId: attachment.thread_id,
        ownerHash: records.ownerHash,
        name: attachment.name,
        mimeType: attachment.mime_type as
          "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        size: attachment.size,
        storageRef,
        createdAt: attachment.created_at.toISOString(),
      });
    }
    report.attachments++;
  }
  return report;
}

async function readLegacyHistory(
  pool: Pool,
  threadId: string,
  attachmentIds: ReadonlySet<string>,
  saver: PostgresSaver,
) {
  const result = await pool.query<LegacyEvent>(
    `SELECT event FROM agentdock_demo_events WHERE thread_id = $1 ORDER BY sequence`,
    [threadId],
  );
  let state = createAgentReducerState();
  const positions = new Map<string, number>();
  const messageTimes = new Map<string, string>();
  const messageOperations = new Map<string, string>();
  const turnByMessage = new Map<string, string>();
  const completed = new Set<string>();
  const operations = new Map<
    string,
    {
      id: string;
      action: "start";
      requestHash: string;
      turnId: string;
      status: "settled";
      runId: string | null;
      createdAt: string;
      updatedAt: string;
      outcome: "complete" | "stopped" | "error";
      publishedPosition: number;
    }
  >();
  let turnCount = 0;
  let currentTurn = `${threadId}:1`;
  for (const row of result.rows) {
    const event = cloneAgentEvent(row.event);
    state = reduceAgentEvent(state, event);
    const operationId = `legacy:${event.runId ?? threadId}`;
    if (!operations.has(operationId)) {
      turnCount++;
      currentTurn = `${threadId}:${turnCount}`;
      operations.set(operationId, {
        id: operationId,
        action: "start",
        requestHash: `legacy-import:${event.runId ?? threadId}`,
        turnId: currentTurn,
        status: "settled",
        runId: event.runId ?? null,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        outcome: "complete",
        publishedPosition: 0,
      });
    }
    if (event.type === AgentEventType.MessageCompleted)
      completed.add(event.messageId);
    if (event.type === AgentEventType.RunCancelled)
      operations.get(operationId)!.outcome = "stopped";
    else if (event.type === AgentEventType.RunFailed)
      operations.get(operationId)!.outcome = "error";
    for (const message of state.messages) {
      if (!positions.has(message.messageId)) {
        positions.set(message.messageId, positions.size);
        messageTimes.set(message.messageId, event.timestamp);
        messageOperations.set(message.messageId, operationId);
        if (message.role === "user") {
          turnCount++;
          currentTurn = `${threadId}:${turnCount}`;
        }
        turnByMessage.set(message.messageId, currentTurn);
      }
    }
  }
  const messages: ConversationMessage[] = state.messages.map((message) => ({
    id: message.messageId,
    turnId: turnByMessage.get(message.messageId) ?? `${threadId}:1`,
    operationId:
      messageOperations.get(message.messageId) ?? `legacy:${threadId}`,
    position: positions.get(message.messageId)!,
    role: message.role,
    content: structuredClone(message.content).map((part) => {
      if (
        (part.type === "image" || part.type === "file") &&
        typeof part.url === "string"
      ) {
        const match = /^\/attachments\/([^/?#]+)$/.exec(part.url);
        if (match && attachmentIds.has(match[1]!))
          return {
            ...part,
            url: `/conversations/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(match[1]!)}`,
          };
      }
      return part;
    }),
    outcome: completed.has(message.messageId)
      ? "complete"
      : state.status === "failed"
        ? "error"
        : "stopped",
    createdAt: messageTimes.get(message.messageId) ?? new Date(0).toISOString(),
  }));
  // The old starter kept user prompts in native checkpoints, not in the event table.
  // This is an offline import only; runtime history never scans checkpoint history.
  const times = new Map<string, string>();
  const snapshots = [];
  for await (const tuple of saver.list({
    configurable: { thread_id: threadId, checkpoint_ns: "" },
  }))
    snapshots.push(tuple);
  snapshots.reverse();
  for (const tuple of snapshots) {
    const values = tuple.checkpoint.channel_values.messages;
    if (!Array.isArray(values)) continue;
    for (const raw of values) {
      const message = coerceMessageLikeToMessage(raw);
      if (message.id && !times.has(message.id))
        times.set(message.id, tuple.checkpoint.ts);
    }
  }
  const latest = snapshots.at(-1)?.checkpoint.channel_values.messages;
  const byId = new Map(messages.map((message) => [message.id, message]));
  const nativeToolCalls = new Map<string, ToolCallRecord>();
  if (Array.isArray(latest))
    for (const raw of latest) {
      const message = coerceMessageLikeToMessage(raw);
      const type = message.getType();
      if (type === "system") continue;
      if (!message.id)
        throw new Error("Native migration messages need stable IDs.");
      if (!["human", "ai", "tool"].includes(type))
        throw new Error(`Unsupported native message type: ${type}`);
      const role =
        type === "human" ? "user" : type === "ai" ? "assistant" : "tool";
      const content: ContentPart[] =
        typeof message.content === "string"
          ? message.content
            ? [{ type: "text", text: message.content }]
            : []
          : message.content.map((part) => {
              if (part.type === "text" && typeof part.text === "string")
                return { type: "text" as const, text: part.text };
              if (part.type === "image_url") {
                const source =
                  typeof part.image_url === "string"
                    ? part.image_url
                    : (part.image_url as { url: string }).url;
                return { type: "image" as const, url: source };
              }
              throw new Error(
                "Unsupported native content; migration stopped before retirement.",
              );
            });
      if ("tool_calls" in message && Array.isArray(message.tool_calls))
        for (const call of message.tool_calls) {
          if (typeof call.id !== "string" || typeof call.name !== "string")
            throw new Error("Invalid native tool identity.");
          const toolCall = {
            toolCallId: call.id!,
            name: call.name,
            input: cloneJsonObject(call.args),
          };
          nativeToolCalls.set(call.id, toolCall);
          content.push({ type: "tool-call", toolCall });
        }
      if (
        type === "tool" &&
        "tool_call_id" in message &&
        typeof message.tool_call_id === "string"
      ) {
        const call = nativeToolCalls.get(message.tool_call_id);
        if (call)
          content.splice(0, content.length, {
            type: "tool-result",
            result: {
              ...call,
              output: cloneJsonValue(message.content),
              isError: "status" in message && message.status === "error",
            },
          });
      }
      const saved = byId.get(message.id);
      const createdAt = times.get(message.id) ?? saved?.createdAt;
      if (!createdAt) throw new Error("Native message timestamp is missing.");
      const operation =
        [...operations.values()].find((item) => item.createdAt >= createdAt) ??
        [...operations.values()].at(-1);
      byId.set(message.id, {
        id: message.id,
        role,
        content,
        turnId: "",
        position: 0,
        operationId:
          saved?.operationId ?? operation?.id ?? `legacy:${threadId}`,
        outcome: "complete",
        createdAt,
      });
    }
  const merged = [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.position - b.position,
  );
  turnCount = 0;
  for (const [position, message] of merged.entries()) {
    if (message.role === "user" || turnCount === 0) turnCount++;
    message.turnId = `${threadId}:${turnCount}`;
    message.position = position;
    const operation = operations.get(message.operationId);
    if (operation) operation.turnId = message.turnId;
  }
  for (const operation of operations.values())
    operation.publishedPosition = merged.length;
  return { messages: merged, operations: [...operations.values()], turnCount };
}
