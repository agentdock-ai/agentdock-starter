import { isBaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  AgentEvent,
  AgentReducerMessage,
  AgentReducerState,
  ContentPart,
  ToolCallRecord,
} from "@agentdock-ai/contracts";
import type { CheckpointReader } from "../types.ts";
import {
  cloneContentParts,
  cloneJsonValue,
  cloneJsonObject,
  createAgentReducerState,
  reduceAgentEvent,
} from "@agentdock-ai/contracts";

/** LangChain/provider normalization belongs to this application, not the browser UI. */
const record = z.record(z.string(), z.unknown());
const toolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  args: z.unknown(),
});
const roles: Record<string, AgentReducerMessage["role"]> = {
  human: "user",
  user: "user",
  HumanMessage: "user",
  ai: "assistant",
  assistant: "assistant",
  AIMessage: "assistant",
  AIMessageChunk: "assistant",
  tool: "tool",
  ToolMessage: "tool",
};
type TranscriptMessage = AgentReducerMessage & {
  state?: "complete" | "stopped" | "error";
};

function readNative(native: unknown) {
  const value = record.parse(
    isBaseMessage(native) ? Object.fromEntries(Object.entries(native)) : native,
  );
  return {
    value,
    message: value.type === "constructor" ? record.parse(value.kwargs) : value,
    role: isBaseMessage(native) ? native.getType() : undefined,
  };
}

export function normalizeMessages(
  nativeMessages: unknown[] | null,
  imageUrls = new Map<string, string>(),
): TranscriptMessage[] {
  const calls = new Map<string, ToolCallRecord>();
  const messages: TranscriptMessage[] = [];
  for (const native of nativeMessages ?? []) {
    const { value, message, role: nativeType } = readNative(native);
    const nativeRole: unknown =
      nativeType ??
      message.role ??
      message.type ??
      (Array.isArray(value.id) ? value.id.at(-1) : undefined);
    if (typeof nativeRole !== "string")
      throw new Error("Invalid checkpoint message role.");
    const role = roles[nativeRole];
    if (["system", "SystemMessage"].includes(nativeRole)) continue;
    if (!role || typeof message.id !== "string" || !message.id)
      throw new Error(
        "Checkpoint messages require a supported role and native message ID.",
      );
    let content: ContentPart[];
    if (role === "tool") {
      const call =
        typeof message.tool_call_id === "string"
          ? calls.get(message.tool_call_id)
          : undefined;
      if (!call)
        throw new Error("Checkpoint tool result has no matching tool call.");
      content = [
        {
          type: "tool-result",
          result: {
            ...call,
            output: cloneJsonValue(message.content),
            ...(message.status === "error" ? { isError: true } : {}),
          },
        },
      ];
    } else {
      content = normalizeContent(message.content, imageUrls);
      for (const nativeCall of z
        .array(toolCallSchema)
        .parse(message.tool_calls ?? [])) {
        const call = {
          toolCallId: nativeCall.id,
          name: nativeCall.name,
          input: cloneJsonObject(nativeCall.args),
        };
        calls.set(call.toolCallId, call);
        content.push({ type: "tool-call", toolCall: call });
      }
    }
    messages.push({
      messageId: message.id,
      role,
      content: cloneContentParts(content),
    });
  }
  return messages;
}

function normalizeContent(
  content: unknown,
  imageUrls: Map<string, string>,
): ContentPart[] {
  if (typeof content === "string")
    return content ? [{ type: "text", text: content }] : [];
  if (content == null) return [];
  if (!Array.isArray(content))
    throw new Error("Unsupported checkpoint message content.");
  return cloneContentParts(
    content.map((input: unknown) => {
      if (typeof input === "string") return { type: "text", text: input };
      const part = record.parse(input);
      if (part.type === "image_url") {
        const url =
          typeof part.image_url === "string"
            ? part.image_url
            : part.image_url &&
                typeof part.image_url === "object" &&
                "url" in part.image_url
              ? part.image_url.url
              : undefined;
        if (typeof url !== "string")
          throw new Error("Checkpoint image has no URL.");
        return { type: "image", url: imageUrls.get(url) ?? url };
      }
      if (part.type === "image" && part.source_type === "base64") {
        const url = `data:${part.mime_type};base64,${part.data}`;
        return {
          type: "image",
          url: imageUrls.get(url) ?? url,
          mimeType: part.mime_type,
        };
      }
      if (part.type === "image" && typeof part.url === "string")
        return {
          type: "image",
          url: imageUrls.get(part.url) ?? part.url,
          ...(part.mimeType || part.mime_type
            ? { mimeType: part.mimeType ?? part.mime_type }
            : {}),
        };
      if (part.type === "thinking")
        return { type: "reasoning", text: part.thinking };
      if (
        [
          "text",
          "reasoning",
          "image",
          "audio",
          "video",
          "file",
          "citation",
        ].includes(String(part.type))
      )
        return part;
      return {
        type: "custom",
        name: part.type ?? "model-content",
        data: cloneJsonValue(part),
      };
    }),
  );
}

/** Read native message introduction times so saved stream fragments retain turn order. */
export async function readCheckpointMessageTimes(
  checkpointer: CheckpointReader,
  threadId: string,
) {
  const times = new Map<string, number>();
  for await (const saved of checkpointer.list({
    configurable: { thread_id: threadId, checkpoint_ns: "" },
  })) {
    const time = Date.parse(saved.checkpoint.ts);
    if (!Number.isFinite(time))
      throw new Error("Invalid checkpoint timestamp.");
    for (const native of z
      .array(z.unknown())
      .parse(saved.checkpoint.channel_values.messages ?? [])) {
      const { message } = readNative(native);
      if (typeof message?.id !== "string") continue;
      times.set(message.id, Math.min(times.get(message.id) ?? Infinity, time));
    }
  }
  return times;
}

/** Reduce saved canonical events for display only; never replay them into the graph. */
interface SavedRun {
  state: AgentReducerState;
  completedMessages: Set<string>;
  messageTimes: Map<string, number>;
  terminal: AgentEvent["type"] | null;
}

function savedRuns(events: AgentEvent[]) {
  const runs = new Map<string, SavedRun>();
  for (const event of events) {
    let run = runs.get(event.runId);
    if (!run) {
      run = {
        state: createAgentReducerState(),
        completedMessages: new Set(),
        messageTimes: new Map(),
        terminal: null,
      };
      runs.set(event.runId, run);
    }
    run.state = reduceAgentEvent(run.state, event);
    if (
      "messageId" in event &&
      event.messageId &&
      !run.messageTimes.has(event.messageId)
    )
      run.messageTimes.set(event.messageId, Date.parse(event.timestamp));
    if (event.type === "message.completed")
      run.completedMessages.add(event.messageId);
    if (["run.completed", "run.failed", "run.cancelled"].includes(event.type))
      run.terminal = event.type;
  }
  return [...runs.values()];
}

export function wasStopped(events: AgentEvent[]) {
  const latest = savedRuns(events).at(-1);
  return Boolean(
    latest &&
    (latest.terminal === "run.cancelled" ||
      (!latest.terminal && latest.state.status !== "waiting")),
  );
}

/** Merge durable partial answers with checkpoint messages using native identity and timing. */
export function restoreTranscript(
  nativeMessages: unknown[] | null,
  events: AgentEvent[],
  checkpointTimes: Map<string, number>,
  imageUrls = new Map<string, string>(),
) {
  const messages = normalizeMessages(nativeMessages, imageUrls);
  const ids = new Set(messages.map((message) => message.messageId));
  const users = messages.filter((message) => message.role === "user");
  const additions = new Map<string, TranscriptMessage[]>();
  const messageTimes = new Map(checkpointTimes);
  for (const run of savedRuns(events)) {
    for (const [id, time] of run.messageTimes) messageTimes.set(id, time);
    for (const message of run.state.messages) {
      if (
        message.role !== "assistant" ||
        ids.has(message.messageId) ||
        !message.content.length
      )
        continue;
      const time = run.messageTimes.get(message.messageId);
      const user = users.findLast(
        (item) =>
          (checkpointTimes.get(item.messageId) ?? Infinity) <=
          (time ?? -Infinity),
      );
      if (!user)
        throw new Error("Saved answer has no native checkpoint user message.");
      const state = run.completedMessages.has(message.messageId)
        ? "complete"
        : run.terminal === "run.failed"
          ? "error"
          : "stopped";
      const list = additions.get(user.messageId) ?? [];
      list.push({ ...message, state });
      additions.set(user.messageId, list);
      ids.add(message.messageId);
    }
  }
  const result: TranscriptMessage[] = [];
  let pending: TranscriptMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      result.push(...pending);
      pending = additions.get(message.messageId) ?? [];
    } else {
      const time = messageTimes.get(message.messageId) ?? Infinity;
      while (
        pending.length &&
        (messageTimes.get(pending[0].messageId) ?? Infinity) <= time
      )
        result.push(pending.shift()!);
    }
    result.push(message);
  }
  result.push(...pending);
  return result;
}
