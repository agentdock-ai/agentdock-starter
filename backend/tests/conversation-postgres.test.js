import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AIMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { Agentdock } from "@agentdock-ai/agentdock";
import { ConversationService } from "@agentdock-ai/conversations";
import { createAgent } from "langchain";
import { createDatabase } from "../src/database.ts";
import { createStartInput } from "../src/services/run-input.ts";

const databaseUrl = process.env.AGENTDOCK_TEST_DATABASE_URL;

test(
  "PostgresStore/checkpointer persist current conversations and attachment bytes",
  {
    skip:
      !databaseUrl &&
      "Set AGENTDOCK_TEST_DATABASE_URL to a disposable PostgreSQL database.",
    timeout: 30000,
  },
  async () => {
    assert.match(
      new URL(databaseUrl).pathname,
      /test/i,
      "AGENTDOCK_TEST_DATABASE_URL must name a disposable test database",
    );
    const database = await createDatabase(databaseUrl);
    const actorId = `postgres-test:${randomUUID()}`;
    const graph = createAgent({
      model: new ScriptedModel(),
      checkpointer: database.checkpointer,
    }).graph;
    const options = {
      runtime: new Agentdock(graph),
      store: database.store,
      fileStorage: database.fileStorage,
      prepareInput: ({ prompt, attachments }) =>
        createStartInput(prompt, attachments),
    };
    let service = new ConversationService(options);
    try {
      const thread = await service.createThread(
        actorId,
        "Postgres compiled graph",
      );
      const operationId = randomUUID();
      let observed = 0;
      for await (const envelope of service.start(actorId, {
        operationId,
        threadId: thread.id,
        prompt: "Answer from a scripted model",
        attachments: [],
      })) {
        assert.equal(envelope.threadId, thread.id);
        assert.equal(envelope.operationId, operationId);
        observed++;
      }
      assert.ok(observed > 0);
      await service.renameThread(actorId, thread.id, "Persisted title");
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzUAAAAASUVORK5CYII=",
        "base64",
      );
      const attachment = await service.uploadAttachment(actorId, thread.id, {
        name: "saved.png",
        mimeType: "image/png",
        bytes: png,
      });

      await service.shutdown();
      service = new ConversationService(options);
      const restored = await service.getHistory(actorId, thread.id);
      assert.equal(restored.thread.title, "Persisted title");
      assert.deepEqual(
        restored.messages.map(({ role, outcome }) => [role, outcome]),
        [
          ["user", "complete"],
          ["assistant", "complete"],
        ],
      );
      assert.equal(
        restored.messages[0].content[0].text,
        "Answer from a scripted model",
      );
      assert.equal(
        restored.messages.at(-1).content[0].text,
        "Postgres persisted answer.",
      );
      assert.equal(
        (await service.listThreads(actorId)).threads[0].id,
        thread.id,
      );
      assert.deepEqual(
        Buffer.from(
          (await service.readAttachment(actorId, thread.id, attachment.id))
            .bytes,
        ),
        png,
      );
      await assert.rejects(
        service.readAttachment("another-actor", thread.id, attachment.id),
        { status: 404 },
      );

      const native = await graph.getState({
        configurable: { thread_id: thread.id },
      });
      assert.equal(
        native.values.messages.at(-1).content,
        "Postgres persisted answer.",
      );
      const independent = await service.createThread(
        actorId,
        "Independent thread",
      );
      assert.deepEqual(
        (await service.getHistory(actorId, independent.id)).messages,
        [],
      );
      assert.equal(
        (await service.getHistory(actorId, independent.id)).actions.canStart,
        true,
      );

      await service.deleteAttachment(actorId, thread.id, attachment.id);
      await service.deleteAttachment(actorId, thread.id, attachment.id);
      await assert.rejects(
        service.readAttachment(actorId, thread.id, attachment.id),
        { status: 404 },
      );
      const bytes = await database.pool.query(
        "SELECT id FROM agentdock_conversation_files WHERE id = $1",
        [attachment.id],
      );
      assert.equal(bytes.rowCount, 0);
    } finally {
      try {
        await service.shutdown();
      } finally {
        await database.close();
      }
    }
  },
);

class ScriptedModel extends FakeStreamingChatModel {
  constructor() {
    super({ sleep: 0 });
  }
  bindTools() {
    return this;
  }
  async *_streamResponseChunks(_messages, _options, manager) {
    this.responses = [new AIMessage("Postgres persisted answer.")];
    yield* super._streamResponseChunks(_messages, _options, manager);
  }
}
