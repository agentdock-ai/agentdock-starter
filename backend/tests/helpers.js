import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { AIMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { Agentdock } from "@agentdock-ai/agentdock";
import { createApp } from "../src/app.ts";
import { httpError } from "../src/schemas.ts";

class LatestRequestModel extends FakeStreamingChatModel {
  calls = [];
  bindTools() {
    return this;
  }
  async *_streamResponseChunks(messages, options, manager) {
    this.calls.push(messages);
    const latest = messages.findLast((m) => m.getType() === "human");
    const text = JSON.stringify(latest.content);
    this.responses = [
      new AIMessage(
        text.includes("name")
          ? "Your name is Zain."
          : "The Sun moves through the galaxy. ".repeat(10),
      ),
    ];
    yield* super._streamResponseChunks(messages, options, manager);
  }
}

export async function fixture(t) {
  const threadId = randomUUID();
  const events = [];
  const model = new LatestRequestModel({ sleep: 2 });
  const checkpointer = new MemorySaver();
  const graph = createAgent({ model, checkpointer }).graph;
  const runtime = new Agentdock(graph);
  const attachments = new Map();
  const repository = {
    async health() {},
    async listThreads() {
      return [{ id: threadId, title: "Test" }];
    },
    async createThread() {
      return { id: threadId, title: "Test" };
    },
    async requireThread(id) {
      if (id !== threadId) throw httpError(404, "Thread not found.");
      return { id, title: "Test" };
    },
    async setTitle() {},
    async touchThread() {},
    async loadEvents() {
      return [...events];
    },
    async saveEvent(_id, event) {
      if (!events.some((item) => item.eventId === event.eventId))
        events.push(event);
    },
    async listAttachments() {
      return [...attachments.values()];
    },
    async loadAttachments(_id, ids) {
      const files = [...new Set(ids)].map((id) => attachments.get(id));
      if (files.some((file) => !file))
        throw httpError(400, "Attachment is missing.");
      return files;
    },
    async createAttachment(_id, file) {
      const id = randomUUID();
      attachments.set(id, { id, ...file });
      return id;
    },
    async requireAttachment(id) {
      if (!attachments.has(id)) throw httpError(404, "Attachment not found.");
      return attachments.get(id);
    },
  };
  const { app, shutdown } = createApp({ runtime, repository, checkpointer });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await shutdown();
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: threadId, ...body }),
    });
  return {
    threadId,
    events,
    runtime,
    model,
    base,
    post,
    repository,
    attachments,
    shutdown,
  };
}

async function* streamEvents(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    buffer += decoder.decode(next.value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (frame.startsWith("data: ")) yield JSON.parse(frame.slice(6));
    }
  }
}

export async function stoppedResponse(f, prompt) {
  const operationId = randomUUID();
  const response = await f.post("/agent", {
    action: "start",
    operationId,
    message: prompt,
  });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const iterator = streamEvents(reader);
  let partial = "";
  while (partial.length < 4) {
    const next = await iterator.next();
    assert.equal(next.done, false, "stream must produce partial content");
    if (next.value.type === "message.part.delta")
      partial += next.value.part.text ?? "";
  }
  const cancelled = await f.post("/agent/cancel", { operationId });
  assert.equal(cancelled.status, 204);
  await reader.cancel();
  await iterator.return();
  return partial;
}
