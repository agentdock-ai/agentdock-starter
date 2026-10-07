import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fixture, startRequest, stoppedResponse } from "./helpers.js";

test(
  "Stop retains its partial transcript; a fresh prompt and explicit Continue remain distinct",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const partial = await stoppedResponse(f, "Explain how the Sun moves");
    const historyResponse = await fetch(
      `${f.base}/conversations/${f.threadId}/history`,
    );
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.equal(history.messages[1].outcome, "stopped");
    assert.ok(history.messages[1].content[0].text.startsWith(partial));
    assert.ok(history.nativeControls.pendingNodes.length > 0);
    const continued = await f.post(`/conversations/${f.threadId}/continue`, {
      operationId: randomUUID(),
      threadId: f.threadId,
      pendingOperationId: history.execution.operationId,
    });
    assert.equal(continued.status, 200);
    assert.ok((await continued.text()).includes("run.completed"));
    const messages = f.model.calls.at(-1);
    assert.ok(messages.length > 0);

    const fresh = await startRequest(f, "Great, what is my name?");
    assert.equal(fresh.response.status, 200);
    assert.ok((await fresh.response.text()).includes("message.completed"));
    const restored = await (
      await fetch(`${f.base}/conversations/${f.threadId}/history`)
    ).json();
    assert.deepEqual(
      restored.messages.map(({ role }) => role),
      ["user", "assistant", "assistant", "user", "assistant"],
    );
    assert.equal(restored.messages[1].outcome, "stopped");
    assert.equal(
      restored.messages.at(-1).content[0].text,
      "Your name is Zain.",
    );
  },
);

test("thread records are actor scoped and creation does not invoke the graph", async (t) => {
  const f = await fixture(t);
  const list = await (await fetch(`${f.base}/conversations`)).json();
  assert.equal(list.threads.length, 1);
  assert.equal(f.model.calls.length, 0);
  assert.equal(
    (await f.post(`/conversations/${f.threadId}`, { title: "Updated title" }))
      .status,
    404,
  );
  const patch = await fetch(`${f.base}/conversations/${f.threadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Updated title" }),
  });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).thread.title, "Updated title");
  const hidden = await f.post(`/conversations/${randomUUID()}/start`, {
    operationId: randomUUID(),
    threadId: randomUUID(),
    prompt: "no",
    attachments: [],
  });
  assert.equal(hidden.status, 400);
});

test("attachments are scoped to a thread and served from stable same-origin URLs", async (t) => {
  const f = await fixture(t);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzUAAAAASUVORK5CYII=",
    "base64",
  );
  const form = new FormData();
  form.set("file", new Blob([png], { type: "image/png" }), "saved.png");
  const uploaded = await fetch(
    `${f.base}/conversations/${f.threadId}/attachments`,
    { method: "POST", body: form },
  );
  assert.equal(uploaded.status, 201);
  const result = await uploaded.json();
  assert.equal(result.content.url, result.url);
  const served = await fetch(`${f.base}${result.url}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
  assert.equal(
    (
      await fetch(
        `${f.base}/conversations/${randomUUID()}/attachments/${result.id}`,
      )
    ).status,
    404,
  );
});
