import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AIMessageChunk } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgent, humanInTheLoopMiddleware, tool } from "langchain";
import { z } from "zod";
import { Agentdock, validateToolApprovalResume } from "@agentdock-ai/agentdock";
import { createInMemoryConversationStore } from "@agentdock-ai/conversations";
import {
  createConversationApplication,
  createStartInput,
} from "agentdock-starter-server-core";

export function registerHttpConformanceTests(backendName, startServer) {
  test(`${backendName} serves the shared API docs and health contract`, async (t) => {
    const fixture = await createFixture(t, startServer);
    const health = await fetch(`${fixture.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "ok",
      database: "connected",
    });
    const trailingSlashHealth = await fetch(`${fixture.base}/health/`);
    assert.equal(trailingSlashHealth.status, 200);
    assert.deepEqual(await trailingSlashHealth.json(), {
      status: "ok",
      database: "connected",
    });

    const openapi = await fetch(`${fixture.base}/openapi.json`);
    assert.equal(openapi.status, 200);
    assert.ok((await openapi.json()).paths["/conversations"]);

    const docs = await fetch(`${fixture.base}/docs`);
    assert.equal(docs.status, 200);
    assert.match(docs.headers.get("content-type"), /text\/html/);
  });

  test(`${backendName} preserves conversation CRUD and streamed turns`, async (t) => {
    const fixture = await createFixture(t, startServer);
    const createdResponse = await fixture.post("/conversations", {
      title: "Adapter contract",
    });
    assert.equal(createdResponse.status, 201);
    const { thread } = await createdResponse.json();

    const listed = await (await fetch(`${fixture.base}/conversations`)).json();
    assert.equal(listed.threads[0].id, thread.id);

    const renamed = await fixture.post(
      `/conversations/${thread.id}`,
      { title: "Renamed adapter contract" },
      "PATCH",
    );
    assert.equal(renamed.status, 200);
    assert.equal(
      (await renamed.json()).thread.title,
      "Renamed adapter contract",
    );

    const operationId = randomUUID();
    const started = await fixture.post(`/conversations/${thread.id}/start`, {
      operationId,
      threadId: thread.id,
      prompt: "Say hello",
      attachments: [],
    });
    assert.equal(started.status, 200);
    const stream = await started.text();
    assert.match(stream, /message\.completed/);
    assert.match(stream, /run\.completed/);

    const history = await (
      await fetch(`${fixture.base}/conversations/${thread.id}/history`)
    ).json();
    assert.equal(history.thread.id, thread.id);
    assert.equal(history.messages[0].content[0].text, "Say hello");
    assert.equal(history.messages.at(-1).content[0].text, "A streamed answer.");
  });

  test(`${backendName} preserves attachment upload, retrieval, and disconnect recovery`, async (t) => {
    const fixture = await createFixture(t, startServer);
    const created = await fixture.post("/conversations", {});
    const { thread } = await created.json();
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzUAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.set("file", new Blob([bytes], { type: "image/png" }), "note.png");
    const upload = await fetch(
      `${fixture.base}/conversations/${thread.id}/attachments`,
      { method: "POST", body: form },
    );
    assert.equal(upload.status, 201);
    const attachment = await upload.json();
    const retrieved = await fetch(`${fixture.base}${attachment.url}`);
    assert.equal(retrieved.status, 200);
    assert.deepEqual(Buffer.from(await retrieved.arrayBuffer()), bytes);

    const operationId = randomUUID();
    const streaming = await fixture.post(`/conversations/${thread.id}/start`, {
      operationId,
      threadId: thread.id,
      prompt: "Disconnect safely",
      attachments: [],
    });
    const reader = streaming.body.getReader();
    await reader.read();
    await reader.cancel();
    const afterDisconnect = await fetch(`${fixture.base}/conversations`);
    assert.equal(afterDisconnect.status, 200);
  });

  test(`${backendName} preserves the approval and resume flow`, async (t) => {
    const fixture = await createFixture(t, startServer);
    const created = await fixture.post("/conversations", {});
    const { thread } = await created.json();
    const startOperationId = randomUUID();
    const started = await fixture.post(`/conversations/${thread.id}/start`, {
      operationId: startOperationId,
      threadId: thread.id,
      prompt: "Request approval for an action",
      attachments: [],
    });
    assert.equal(started.status, 200);
    assert.match(await started.text(), /interrupt\.required/);

    const pausedHistory = await (
      await fetch(`${fixture.base}/conversations/${thread.id}/history`)
    ).json();
    const interruptId = pausedHistory.interrupts[0]?.interruptId;
    assert.ok(interruptId);

    const approved = await fixture.post(
      `/conversations/${thread.id}/approvals`,
      {
        operationId: randomUUID(),
        threadId: thread.id,
        interruptId,
        decisions: [{ type: "approve" }],
      },
    );
    assert.equal(approved.status, 200);
    assert.match(await approved.text(), /interrupt\.resolved/);
  });
}

async function createFixture(t, startServer) {
  const model = new ContractModel({ sleep: 1 });
  const approvalTool = tool(async () => "Approved action completed.", {
    name: "approval_action",
    description: "A test action that requires approval",
    schema: z.object({ label: z.string() }),
  });
  const runtime = new Agentdock(
    createAgent({
      model,
      tools: [approvalTool],
      checkpointer: new MemorySaver(),
      middleware: [
        humanInTheLoopMiddleware({ interruptOn: { approval_action: true } }),
      ],
    }).graph,
    {
      interruptFormat: Agentdock.HITL,
      validateResume: validateToolApprovalResume,
    },
  );
  const files = new Map();
  const application = createConversationApplication({
    runtime,
    store: createInMemoryConversationStore(),
    fileStorage: {
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
    },
    actorId: "adapter-contract-owner",
    prepareInput: (prompt, attachments) =>
      createStartInput(prompt, attachments),
    health: async () => {},
  });
  const server = await startServer(application);
  t.after(() => server.close());

  return {
    ...server,
    post(path, body, method = "POST") {
      return fetch(`${server.base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}

class ContractModel extends BaseChatModel {
  bindTools() {
    return this;
  }

  _llmType() {
    return "adapter-contract";
  }

  async _generate() {
    throw new Error("The adapter contract fixture requires streaming.");
  }

  async *_streamResponseChunks(messages, _options, manager) {
    const latest = messages.findLast(
      (message) => message.getType() === "human",
    );
    const prompt = JSON.stringify(latest?.content ?? "").toLowerCase();
    const afterTool = messages.at(-1)?.getType() === "tool";
    const chunks =
      prompt.includes("request approval") && !afterTool
        ? createToolCallArgumentChunks({
            name: "approval_action",
            toolCallId: randomUUID(),
            input: { label: "contract test" },
            messageId: randomUUID(),
          })
        : createScriptedMessageChunks("A streamed answer.".match(/.{1,6}/g), {
            id: randomUUID(),
          });

    for (const chunk of chunks) {
      const generation = new ChatGenerationChunk({ message: chunk });
      yield generation;
      await manager?.handleLLMNewToken(
        "",
        undefined,
        undefined,
        undefined,
        undefined,
        { chunk: generation },
      );
    }
  }
}

function createScriptedMessageChunks(contents, { id }) {
  return contents.map((content) => new AIMessageChunk({ content, id }));
}

function createToolCallArgumentChunks({ name, toolCallId, input, messageId }) {
  const serializedInput = JSON.stringify(input);
  const chunks = [];
  let offset = 0;
  const chunkCount = 3;

  for (let index = 0; index < chunkCount; index += 1) {
    const length = Math.ceil(
      (serializedInput.length - offset) / (chunkCount - index),
    );
    chunks.push(
      new AIMessageChunk({
        content: "",
        id: messageId,
        tool_call_chunks: [
          {
            ...(index === 0 ? { name } : {}),
            args: serializedInput.slice(offset, offset + length),
            id: toolCallId,
            index: 0,
          },
        ],
      }),
    );
    offset += length;
  }
  return chunks;
}
