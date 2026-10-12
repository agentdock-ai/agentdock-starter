import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const databaseUrl = process.env.AGENTDOCK_TEST_DATABASE_URL;
const worker = fileURLToPath(
  new URL("./conversation-process-worker.mjs", import.meta.url),
);

test(
  "separate processes restore a native approval, transcript, and operation result",
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
    const actorId = `restart-test:${randomUUID()}`;
    const run = async (...args) => {
      const { stdout } = await execute(
        process.execPath,
        [worker, databaseUrl, ...args],
        { timeout: 20000, maxBuffer: 1024 * 1024 },
      );
      return JSON.parse(stdout);
    };

    const paused = await run("start", actorId);
    assert.notEqual(paused.pid, process.pid);
    assert.ok(paused.threadId);
    assert.ok(paused.interruptId);
    assert.equal(paused.status, "paused");
    assert.ok(paused.messageCount >= 1);

    const completed = await run("approve", actorId, paused.threadId);
    assert.notEqual(completed.pid, paused.pid);
    assert.equal(completed.threadId, paused.threadId);
    assert.equal(completed.restoredInterruptId, paused.interruptId);
    assert.equal(completed.beforeStatus, "paused");
    assert.equal(completed.afterStatus, null);
    assert.deepEqual(completed.toolEffects, [
      { path: "recovered.txt", content: "persisted" },
    ]);
    assert.equal(completed.assistantText, "The approved file is saved.");
  },
);
