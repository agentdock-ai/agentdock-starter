import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { ConversationService } from "@agentdock-ai/conversations";
import { createDatabase } from "../src/database.ts";

const databaseUrl = process.env.AGENTDOCK_TEST_DATABASE_URL;

test(
  "PostgresStore conversation catalog paging and transcript write load",
  {
    skip:
      !databaseUrl &&
      "Set AGENTDOCK_TEST_DATABASE_URL to a disposable PostgreSQL database.",
    timeout: 60000,
  },
  async () => {
    assert.match(
      new URL(databaseUrl).pathname,
      /test/i,
      "AGENTDOCK_TEST_DATABASE_URL must target a disposable database with 'test' in its name",
    );
    const database = await createDatabase(databaseUrl);
    const service = new ConversationService({
      store: database.store,
      pageSize: 40,
      prepareInput: ({ prompt }) => prompt,
      runtime: {
        async *stream({ threadId, input }) {
          const runId = randomUUID();
          const timestamp = new Date().toISOString();
          const base = {
            protocolVersion: 3,
            runId,
            phaseId: "load",
            timestamp,
          };
          yield {
            ...base,
            eventId: `${runId}:1`,
            sequence: 1,
            logicalSequence: 1,
            type: "run.started",
          };
          yield {
            ...base,
            eventId: `${runId}:2`,
            sequence: 2,
            logicalSequence: 2,
            type: "message.started",
            messageId: `answer-${runId}`,
            role: "assistant",
          };
          yield {
            ...base,
            eventId: `${runId}:3`,
            sequence: 3,
            logicalSequence: 3,
            type: "message.part.delta",
            messageId: `answer-${runId}`,
            part: { type: "text", text: `Reply to ${input}` },
          };
          yield {
            ...base,
            eventId: `${runId}:4`,
            sequence: 4,
            logicalSequence: 4,
            type: "message.completed",
            messageId: `answer-${runId}`,
            role: "assistant",
            content: [{ type: "text", text: `Reply to ${input}` }],
          };
          yield {
            ...base,
            eventId: `${runId}:5`,
            sequence: 5,
            logicalSequence: 5,
            type: "run.completed",
            finishReason: "stop",
            content: [],
          };
        },
        async getMessages() {
          return null;
        },
        async getResumeState() {
          return null;
        },
      },
    });
    const actorId = `load-test:${randomUUID()}`;
    try {
      const rssBefore = process.memoryUsage().rss;
      const createStarted = performance.now();
      const threads = await Promise.all(
        Array.from({ length: 240 }, (_, index) =>
          service.createThread(actorId, `Load thread ${index}`),
        ),
      );
      const createMs = performance.now() - createStarted;

      const allThreads = [];
      let cursor = null;
      const pageLatencies = [];
      do {
        const started = performance.now();
        const page = await service.listThreads(actorId, cursor);
        pageLatencies.push(performance.now() - started);
        assert.ok(page.threads.length <= 40);
        allThreads.push(...page.threads);
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(allThreads.length, 240);
      assert.equal(new Set(allThreads.map(({ id }) => id)).size, 240);

      const transcriptThread = threads[0];
      const writeLatencies = [];
      for (let index = 0; index < 50; index += 1) {
        const started = performance.now();
        for await (const _event of service.start(actorId, {
          operationId: randomUUID(),
          threadId: transcriptThread.id,
          prompt: `load prompt ${index}`,
          attachments: [],
        })) {
          // Consuming the stream measures accepted transcript write latency.
        }
        writeLatencies.push(performance.now() - started);
      }
      const history = await service.getHistory(actorId, transcriptThread.id);
      assert.equal(history.messages.length, 40);
      assert.equal(history.messages[0]?.position, 60);
      assert.equal(history.messages.at(-1)?.position, 99);
      assert.ok(history.nextCursor);

      const rssAfter = process.memoryUsage().rss;
      console.log(
        "CONVERSATION_LOAD_RESULT",
        JSON.stringify({
          threads: threads.length,
          catalogPages: pageLatencies.length,
          createThreadsMs: Number(createMs.toFixed(1)),
          catalogPageP95Ms: percentile(pageLatencies, 0.95),
          transcriptTurns: writeLatencies.length,
          transcriptWriteP95Ms: percentile(writeLatencies, 0.95),
          transcriptPageSize: history.messages.length,
          rssDeltaBytes: rssAfter - rssBefore,
        }),
      );
    } finally {
      await service.shutdown();
      await database.close();
    }
  },
);

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  return Number(ordered[Math.ceil(ordered.length * quantile) - 1]?.toFixed(1));
}
