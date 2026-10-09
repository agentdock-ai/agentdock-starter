import { randomUUID } from "node:crypto";
import { createAgent, humanInTheLoopMiddleware, tool } from "langchain";
import { z } from "zod";
import { Agentdock, validateToolApprovalResume } from "@agentdock-ai/agentdock";
import {
  createScriptedChatModel,
  createScriptedMessageChunks,
  createToolCallArgumentChunks,
} from "../../../agentdock/packages/agentdock/test/helpers/stream-fixtures.mjs";
import { createDatabase } from "../src/database.ts";
import { createStartInput } from "../src/services/run-input.ts";
import { ConversationService } from "@agentdock-ai/conversations";

const [databaseUrl, action, actorId, threadId] = process.argv.slice(2);
if (!databaseUrl || !action || !actorId)
  throw new Error(
    "Expected database URL, action, actor ID, and optional thread ID.",
  );

const database = await createDatabase(databaseUrl);
const toolEffects = [];
const writeFile = tool(
  async (input) => {
    toolEffects.push(input);
    return "File saved after restart.";
  },
  {
    name: "write_file",
    description: "Write a test file",
    schema: z.object({ path: z.string(), content: z.string() }),
  },
);
const firstCall = createToolCallArgumentChunks({
  name: "write_file",
  toolCallId: "restart-write-call",
  input: { path: "recovered.txt", content: "persisted" },
  messageId: "restart-tool-request",
});
const model = createScriptedChatModel({
  streamSequences:
    action === "start"
      ? [firstCall]
      : [
          createScriptedMessageChunks(["The approved file is saved."], {
            id: "restart-final-answer",
          }),
        ],
});
const graph = createAgent({
  model,
  tools: [writeFile],
  checkpointer: database.checkpointer,
  middleware: [humanInTheLoopMiddleware({ interruptOn: { write_file: true } })],
}).graph;
const runtime = new Agentdock(graph, {
  interruptFormat: Agentdock.HITL,
  validateResume: validateToolApprovalResume,
});
const service = new ConversationService({
  runtime,
  store: database.store,
  fileStorage: database.fileStorage,
  prepareInput: ({ prompt, attachments }) =>
    createStartInput(prompt, attachments),
});

try {
  if (action === "start") {
    const thread = await service.createThread(
      actorId,
      "Process restart approval",
    );
    const envelopes = [];
    for await (const envelope of service.start(actorId, {
      operationId: randomUUID(),
      threadId: thread.id,
      prompt: "Write the file after approval.",
      attachments: [],
    }))
      envelopes.push(envelope);
    const history = await service.getHistory(actorId, thread.id);
    console.log(
      JSON.stringify({
        pid: process.pid,
        threadId: thread.id,
        interruptId: history.interrupts[0]?.interruptId,
        status: history.execution?.status,
        messageCount: history.messages.length,
        eventTypes: envelopes.map(({ event }) => event.type),
      }),
    );
  } else if (action === "approve" && threadId) {
    const before = await service.getHistory(actorId, threadId);
    const interruptId = before.interrupts[0]?.interruptId;
    if (!interruptId)
      throw new Error("Native approval was not restored after restart.");
    const envelopes = [];
    for await (const envelope of service.respondToInterrupt(actorId, {
      operationId: randomUUID(),
      threadId,
      interruptId,
      decisions: [{ type: "approve" }],
    }))
      envelopes.push(envelope);
    const after = await service.getHistory(actorId, threadId);
    console.log(
      JSON.stringify({
        pid: process.pid,
        threadId,
        restoredInterruptId: interruptId,
        beforeStatus: before.execution?.status,
        afterStatus: after.execution?.status ?? null,
        messageCount: after.messages.length,
        toolEffects,
        assistantText: after.messages.findLast(
          (message) => message.role === "assistant",
        )?.content[0]?.text,
        eventTypes: envelopes.map(({ event }) => event.type),
      }),
    );
  } else {
    throw new Error(`Unsupported worker action: ${action}`);
  }
} finally {
  await service.shutdown();
  await database.close();
}

// LangGraph/Postgres internals can leave non-database async handles alive after
// their owned Store and Pool have closed. This worker is an isolated process.
process.exit(0);
