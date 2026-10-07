import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { InMemoryStore } from "@langchain/langgraph-checkpoint";
import { Agentdock } from "@agentdock-ai/agentdock";
import {
  ConversationRecords,
  ConversationService,
} from "@agentdock-ai/conversations";
import { createAgent } from "langchain";
import { createDatabase } from "../src/database.ts";
import { createStartInput } from "../src/services/run-input.ts";
import { migrateDemoConversations } from "../scripts/migration/demo-conversations.ts";
import { interrupted, sequence } from "./event-fixtures.js";

const databaseUrl = process.env.AGENTDOCK_TEST_DATABASE_URL;

test(
  "PostgresStore/checkpointer persist compiled graph conversations and legacy migration is idempotent",
  {
    skip:
      !databaseUrl &&
      "Set AGENTDOCK_TEST_DATABASE_URL to a disposable PostgreSQL database.",
    timeout: 30000,
  },
  async () => {
    const databaseName = new URL(databaseUrl).pathname;
    assert.match(
      databaseName,
      /test/i,
      "AGENTDOCK_TEST_DATABASE_URL must point to a disposable database with 'test' in its name",
    );
    const database = await createDatabase(databaseUrl);
    const actorId = `migration-test:${randomUUID()}`;
    const threadId = randomUUID();
    try {
      const model = new ScriptedModel();
      const graph = createAgent({
        model,
        checkpointer: database.checkpointer,
      }).graph;
      const runtime = new Agentdock(graph);
      const service = new ConversationService({
        runtime,
        store: database.store,
        fileStorage: database.fileStorage,
        prepareInput: ({ prompt, attachments }) =>
          createStartInput(prompt, attachments),
      });
      const thread = await service.createThread(
        actorId,
        "Postgres compiled graph",
      );
      const events = service.start(actorId, {
        operationId: randomUUID(),
        threadId: thread.id,
        prompt: "Answer from a scripted model",
        attachments: [],
      });
      let observed = 0;
      for await (const envelope of events) {
        assert.equal(envelope.threadId, thread.id);
        observed++;
      }
      assert.ok(observed > 0);
      const history = await service.getHistory(actorId, thread.id);
      assert.equal(
        history.messages.at(-1)?.content[0]?.text,
        "Postgres persisted answer.",
      );

      await database.pool.query(`
      CREATE TABLE IF NOT EXISTS agentdock_demo_threads (
        id uuid PRIMARY KEY, owner_id text NOT NULL, title text NOT NULL DEFAULT 'New thread',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS agentdock_demo_events (
        sequence bigserial PRIMARY KEY, thread_id uuid NOT NULL REFERENCES agentdock_demo_threads(id) ON DELETE CASCADE,
        event_id text NOT NULL, event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(thread_id,event_id)
      );
      CREATE TABLE IF NOT EXISTS agentdock_demo_attachments (
        id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES agentdock_demo_threads(id) ON DELETE CASCADE,
        owner_id text NOT NULL, name text NOT NULL, mime_type text NOT NULL, size integer NOT NULL,
        data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
      // This test owns the migration-test:* fixture rows in its explicitly disposable DB.
      await database.pool.query(
        `DELETE FROM agentdock_demo_attachments WHERE owner_id LIKE 'migration-test:%'`,
      );
      await database.pool.query(
        `DELETE FROM agentdock_demo_events WHERE thread_id IN (SELECT id FROM agentdock_demo_threads WHERE owner_id LIKE 'migration-test:%')`,
      );
      await database.pool.query(
        `DELETE FROM agentdock_demo_threads WHERE owner_id LIKE 'migration-test:%'`,
      );
      // Cross the 9/10 boundary so textual sequence ordering would corrupt replay.
      await database.pool.query(
        "ALTER SEQUENCE agentdock_demo_events_sequence_seq RESTART WITH 8",
      );
      const legacyId = randomUUID();
      await database.pool.query(
        `INSERT INTO agentdock_demo_threads (id, owner_id, title, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`,
        [
          legacyId,
          actorId,
          "Legacy conversation",
          "2026-01-02T03:04:05.000Z",
          "2026-01-03T03:04:05.000Z",
        ],
      );
      const eventList = [
        ...sequence(
          [
            { type: "run.started" },
            { type: "message.started", messageId: "legacy-user", role: "user" },
            {
              type: "message.completed",
              messageId: "legacy-user",
              role: "user",
              content: [{ type: "text", text: "Keep this prompt" }],
            },
            { type: "run.completed", finishReason: "stop", content: [] },
          ],
          "legacy-run",
          1000,
        ),
        ...interrupted(
          "legacy-stop-run",
          "legacy-partial",
          "Stopped partial answer.",
          2000,
        ),
      ];
      for (const event of eventList) {
        await database.pool.query(
          `INSERT INTO agentdock_demo_events (thread_id,event_id,event) VALUES ($1,$2,$3::jsonb)`,
          [legacyId, event.eventId, JSON.stringify(event)],
        );
      }
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzUAAAAASUVORK5CYII=",
        "base64",
      );
      const attachmentId = randomUUID();
      await database.pool.query(
        `INSERT INTO agentdock_demo_attachments (id,thread_id,owner_id,name,mime_type,size,data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          attachmentId,
          legacyId,
          actorId,
          "legacy.png",
          "image/png",
          png.length,
          png,
        ],
      );

      // The old event stream omitted human prompts. Import them from native
      // checkpoints without requiring a user-message event in the demo table.
      const checkpointOnlyId = randomUUID();
      await graph.invoke(
        {
          messages: [
            new HumanMessage({
              id: "checkpoint-only-user",
              content: "Prompt stored only in the checkpoint",
            }),
          ],
        },
        { configurable: { thread_id: checkpointOnlyId } },
      );
      await database.pool.query(
        "INSERT INTO agentdock_demo_threads (id, owner_id, title) VALUES ($1,$2,$3)",
        [checkpointOnlyId, actorId, "Checkpoint-only prompt"],
      );

      const dryRunStore = new InMemoryStore();
      const dryRun = await migrateDemoConversations({
        pool: database.pool,
        store: dryRunStore,
        fileStorage: database.fileStorage,
        apply: false,
      });
      assert.ok(dryRun.threads >= 1 && dryRun.messages >= 2);
      assert.equal(dryRun.attachments, 1);
      assert.equal(
        await new ConversationRecords(dryRunStore, actorId).getThread(legacyId),
        null,
      );

      const first = await migrateDemoConversations({
        pool: database.pool,
        store: database.store,
        fileStorage: database.fileStorage,
        apply: true,
      });
      const second = await migrateDemoConversations({
        pool: database.pool,
        store: database.store,
        fileStorage: database.fileStorage,
        apply: true,
      });
      assert.ok(
        first.threads >= 1 && first.messages >= 2 && first.attachments >= 1,
      );
      assert.ok(second.skippedExisting >= 2);
      const legacyRecords = new ConversationRecords(database.store, actorId);
      const checkpointOnly = await legacyRecords.getThread(checkpointOnlyId);
      const nativeMessages = await legacyRecords.listMessages(
        checkpointOnlyId,
        20,
        checkpointOnly.nextPosition,
      );
      assert.equal(nativeMessages[0].id, "checkpoint-only-user");
      assert.equal(nativeMessages[0].role, "user");
      assert.equal(
        nativeMessages[0].content[0].text,
        "Prompt stored only in the checkpoint",
      );
      assert.equal(
        nativeMessages.at(-1).content[0].text,
        "Postgres persisted answer.",
      );
      const migrated = await legacyRecords.getThread(legacyId);
      assert.equal(migrated?.title, "Legacy conversation");
      assert.equal(migrated?.createdAt, "2026-01-02T03:04:05.000Z");
      const migratedMessages = await legacyRecords.listMessages(
        legacyId,
        20,
        migrated.nextPosition,
      );
      assert.deepEqual(
        migratedMessages.map((message) => message.id),
        ["legacy-user", "legacy-partial"],
      );
      assert.equal(migratedMessages[1]?.outcome, "stopped");
      const migratedAttachment = await legacyRecords.getAttachment(
        legacyId,
        attachmentId,
      );
      assert.deepEqual(
        Buffer.from(
          await database.fileStorage.get(migratedAttachment.storageRef),
        ),
        png,
      );
      // Prove the current runtime has no dependency on any legacy demo table.
      await database.pool.query(
        "DROP TABLE agentdock_demo_events, agentdock_demo_attachments, agentdock_demo_threads",
      );
      const absent = await database.pool.query(
        "SELECT to_regclass('public.agentdock_demo_threads') AS threads, to_regclass('public.agentdock_demo_events') AS events, to_regclass('public.agentdock_demo_attachments') AS attachments",
      );
      assert.deepEqual(absent.rows[0], {
        threads: null,
        events: null,
        attachments: null,
      });
      const afterDrop = await service.getHistory(actorId, legacyId);
      assert.equal(
        afterDrop.messages[1].content[0].text,
        "Stopped partial answer.",
      );
      assert.deepEqual(
        Buffer.from(
          (await service.readAttachment(actorId, legacyId, attachmentId)).bytes,
        ),
        png,
      );
      const newThread = await service.createThread(
        actorId,
        "After legacy retirement",
      );
      for await (const _event of service.start(actorId, {
        operationId: randomUUID(),
        threadId: newThread.id,
        prompt: "Still works",
        attachments: [],
      })) {
      }
      assert.equal(
        (await service.getHistory(actorId, newThread.id)).messages.at(-1)
          .content[0].text,
        "Postgres persisted answer.",
      );
      await service.shutdown();
    } finally {
      await database.close();
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
