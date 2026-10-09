import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { createAgent, humanInTheLoopMiddleware, tool } from "langchain";
import { z } from "zod";
import { Agentdock, validateToolApprovalResume } from "@agentdock-ai/agentdock";
import {
  createScriptedMessageChunks,
  createToolCallArgumentChunks,
} from "../../../agentdock/packages/agentdock/test/helpers/stream-fixtures.mjs";
import { createApp } from "../src/app.ts";
import { createDatabase } from "../src/database.ts";
import { checkDatabaseConnection } from "../src/models/health-model.ts";
import { createStartInput } from "../src/services/run-input.ts";

const databaseUrl = process.env.AGENTDOCK_TEST_DATABASE_URL;
if (!databaseUrl || !/test/i.test(new URL(databaseUrl).pathname))
  throw new Error("Use an explicitly disposable test database.");
const database = await createDatabase(databaseUrl);
const effects = [];
const approvedAction = tool(
  async (input) => {
    effects.push(input);
    return "Approved test action completed.";
  },
  {
    name: "review_action",
    description: "Test-only approval action",
    schema: z.object({ label: z.string() }),
  },
);
class BrowserModel extends BaseChatModel {
  _llmType() {
    return "deterministic-e2e";
  }
  bindTools() {
    return this;
  }
  async _generate() {
    throw new Error("Streaming fixture required.");
  }
  async *_streamResponseChunks(messages, options, manager) {
    const latest = messages.findLast((m) => m.getType() === "human");
    const prompt = JSON.stringify(latest?.content ?? "").toLowerCase();
    const afterTool = messages.at(-1)?.getType() === "tool";
    let chunks;
    if (prompt.includes("approval") && !afterTool) {
      chunks = createToolCallArgumentChunks({
        name: "review_action",
        toolCallId: randomUUID(),
        input: { label: "browser approval" },
        messageId: randomUUID(),
      });
    } else {
      const text = afterTool
        ? "The approved action is complete."
        : prompt.includes("name")
          ? "Your latest question asks about your name."
          : prompt.includes("sun")
            ? "The Sun moves through the galaxy. ".repeat(80)
            : "This answer responds to the latest prompt.";
      chunks = createScriptedMessageChunks(text.match(/.{1,12}/g), {
        id: randomUUID(),
      });
    }
    for (const chunk of chunks) {
      await delay(20, undefined, { signal: options.signal });
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
const runtime = new Agentdock(
  createAgent({
    model: new BrowserModel({}),
    tools: [approvedAction],
    checkpointer: database.checkpointer,
    middleware: [
      humanInTheLoopMiddleware({ interruptOn: { review_action: true } }),
    ],
  }).graph,
  {
    interruptFormat: Agentdock.HITL,
    validateResume: validateToolApprovalResume,
  },
);
const { app, shutdown } = createApp({
  runtime,
  store: database.store,
  fileStorage: database.fileStorage,
  actorId: "browser-e2e-owner",
  prepareInput: createStartInput,
  health: () => checkDatabaseConnection(database.pool),
});
const server = app.listen(3016, "127.0.0.1", () =>
  console.log(
    "E2E backend ready on 3016 (compiled graph + PostgreSQL; no provider calls)",
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await shutdown();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await database.close();
    process.exit(0);
  });
