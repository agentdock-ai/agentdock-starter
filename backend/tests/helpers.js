import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { AIMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgent } from "langchain";
import { Agentdock } from "@agentdock-ai/agentdock";
import { createInMemoryConversationStore } from "@agentdock-ai/conversations";
import { createApp } from "../src/app.ts";
import { createStartInput } from "../src/services/run-input.ts";

class LatestRequestModel extends FakeStreamingChatModel {
  calls = [];
  bindTools() {
    return this;
  }
  async *_streamResponseChunks(messages, options, manager) {
    this.calls.push(messages);
    const latest = messages.findLast(
      (message) => message.getType() === "human",
    );
    this.responses = [
      new AIMessage(
        JSON.stringify(latest?.content).includes("name")
          ? "Your name is Zain."
          : "The Sun moves through the galaxy. ".repeat(10),
      ),
    ];
    yield* super._streamResponseChunks(messages, options, manager);
  }
}

export async function fixture(t) {
  const model = new LatestRequestModel({ sleep: 2 });
  const checkpointer = new MemorySaver();
  const runtime = new Agentdock(createAgent({ model, checkpointer }).graph);
  const store = createInMemoryConversationStore();
  const files = new Map();
  const fileStorage = {
    async put({ id, bytes }) {
      files.set(id, Buffer.from(bytes));
      return id;
    },
    async get(id) {
      return files.get(id) ?? null;
    },
    async delete(id) {
      files.delete(id);
    },
  };
  const { app, shutdown } = createApp({
    runtime,
    store,
    fileStorage,
    actorId: "fixture-owner",
    prepareInput: (prompt, attachments) =>
      createStartInput(prompt, attachments),
    health: async () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await shutdown();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const created = await post("/conversations", {});
  const { thread } = await created.json();
  return {
    threadId: thread.id,
    model,
    base,
    post,
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

export async function startRequest(f, prompt, operationId = randomUUID()) {
  const path = `/conversations/${f.threadId}/start`;
  const response = await f.post(path, {
    operationId,
    threadId: f.threadId,
    prompt,
    attachments: [],
  });
  return { response, operationId };
}

export async function stoppedResponse(f, prompt) {
  const { response, operationId } = await startRequest(f, prompt);
  assertStatus(response, 200);
  const reader = response.body.getReader();
  const iterator = streamEvents(reader);
  let partial = "";
  while (partial.length < 4) {
    const next = await iterator.next();
    if (next.done)
      throw new Error("Stream ended before producing a partial answer.");
    const event = next.value.event;
    if (event.type === "message.part.delta") partial += event.part.text ?? "";
  }
  const stopped = await f.post(`/conversations/${f.threadId}/stop`, {
    operationId: randomUUID(),
    threadId: f.threadId,
    targetOperationId: operationId,
  });
  assertStatus(stopped, 204);
  await reader.cancel();
  await iterator.return();
  return partial;
}

function assertStatus(response, status) {
  if (response.status !== status)
    throw new Error(`Expected ${status}, received ${response.status}.`);
}
