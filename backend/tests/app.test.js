import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { SUPERSEDE_MESSAGE } from "../src/services/run-input.ts";
import { fixture, stoppedResponse } from "./helpers.js";

test(
  "stop → reload → new question preserves partial text, removes continuation, and starts with the latest input",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const partial = await stoppedResponse(f, "Explain how the Sun moves");
    const historyResponse = await fetch(
      `${f.base}/threads/${f.threadId}/messages`,
    );
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.equal(history.resumeState, null);
    assert.equal(history.messages[1].state, "stopped");
    assert.ok(history.messages[1].content[0].text.startsWith(partial));
    const native = await f.runtime.getMessages(f.threadId);
    assert.equal(
      native.length,
      1,
      "partial display content must not be manufactured as a completed native answer",
    );
    const continued = await f.post("/agent", {
      action: "continue",
      operationId: randomUUID(),
    });
    assert.equal(continued.status, 409);
    const next = await f.post("/agent", {
      action: "start",
      operationId: randomUUID(),
      message: "Great what is my name",
    });
    assert.equal(
      next.status,
      200,
      "cancel acknowledgement must release the thread for the next request",
    );
    const text = await next.text();
    assert.ok(text.includes("message.completed"));
    const call = f.model.calls.at(-1);
    assert.ok(
      call.some(
        (m) => m.getType() === "system" && m.content === SUPERSEDE_MESSAGE,
      ),
    );
    assert.ok(
      JSON.stringify(call.at(-1).content).includes("Great what is my name"),
    );
    const reloaded = await (
      await fetch(`${f.base}/threads/${f.threadId}/messages`)
    ).json();
    assert.deepEqual(
      reloaded.messages.map((m) => m.role),
      ["user", "assistant", "user", "assistant"],
    );
    assert.equal(reloaded.messages[1].state, "stopped");
    assert.equal(
      reloaded.messages.at(-1).content[0].text,
      "Your name is Zain.",
    );
    assert.equal(reloaded.resumeState, null);
  },
);

test(
  "reserves a thread before asynchronous preparation and does not stop a different operation",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const operationId = randomUUID();
    const ready = Promise.withResolvers();
    const release = Promise.withResolvers();
    const getResumeState = f.runtime.getResumeState.bind(f.runtime);
    f.runtime.getResumeState = async (...args) => {
      ready.resolve();
      await release.promise;
      return getResumeState(...args);
    };
    const starting = f.post("/agent", {
      action: "start",
      operationId,
      message: "Explain the Sun",
    });
    await ready.promise;
    const second = await f.post("/agent", {
      action: "start",
      operationId: randomUUID(),
      message: "Second",
    });
    assert.equal(second.status, 409);
    release.resolve();
    const response = await starting;
    const loadingHistory = fetch(`${f.base}/threads/${f.threadId}/messages`);
    assert.equal(
      (await f.post("/agent/cancel", { operationId: randomUUID() })).status,
      409,
    );
    assert.equal((await f.post("/agent/cancel", { operationId })).status, 204);
    await response.body.cancel();
    const history = await (await loadingHistory).json();
    assert.equal(history.resumeState, null);
    assert.equal(f.model.calls.length, 1);
  },
);
