import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fixture } from "./helpers.js";

test("validates IDs, bodies and missing resources with client errors", async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.base}/health`)).status, 200);
  assert.equal((await fetch(`${f.base}/threads`)).status, 200);
  assert.equal((await f.post("/threads", {})).status, 201);
  assert.equal((await fetch(`${f.base}/threads/${f.threadId}`)).status, 200);
  for (const path of [
    "/threads/invalid",
    "/threads/invalid/messages",
    "/attachments/invalid",
  ])
    assert.equal((await fetch(f.base + path)).status, 400, path);
  assert.equal((await fetch(`${f.base}/threads/${randomUUID()}`)).status, 404);
  assert.equal(
    (await fetch(`${f.base}/attachments/${randomUUID()}`)).status,
    404,
  );
  assert.equal((await fetch(`${f.base}/missing`)).status, 404);
  assert.equal((await f.post("/agent", { action: "unknown" })).status, 400);
  assert.equal(
    (
      await f.post("/agent", {
        action: "start",
        operationId: randomUUID(),
        message: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.post("/agent", {
        action: "start",
        operationId: randomUUID(),
        message: "Image",
        attachments: [{ id: randomUUID() }],
      })
    ).status,
    400,
  );
  const malformed = await fetch(`${f.base}/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  const large = await f.post("/agent", { message: "x".repeat(70_000) });
  assert.equal(large.status, 413);
});

function upload(f, data, mimeType, name = "image.png", threadId = f.threadId) {
  const form = new FormData();
  form.set("threadId", threadId);
  if (data) form.set("file", new Blob([data], { type: mimeType }), name);
  return fetch(`${f.base}/attachments`, { method: "POST", body: form });
}

test("uploads and serves images, rejecting missing, oversized or mismatched files", async (t) => {
  const f = await fixture(t);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzUAAAAASUVORK5CYII=",
    "base64",
  );
  assert.equal((await upload(f)).status, 400);
  assert.equal((await upload(f, "text", "image/png")).status, 415);
  assert.equal((await upload(f, png, "image/jpeg")).status, 415);
  assert.equal(
    (await upload(f, png, "image/png", "image.png", randomUUID())).status,
    404,
  );
  assert.equal(
    (await upload(f, Buffer.alloc(5 * 1024 * 1024 + 1), "image/png")).status,
    413,
  );
  const response = await upload(f, png, "image/png", "my image's.png");
  assert.equal(response.status, 201);
  const attachment = await response.json();
  const saved = await fetch(f.base + attachment.content.url);
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("content-type"), "image/png");
  assert.equal(saved.headers.get("x-content-type-options"), "nosniff");
  assert.ok(
    saved.headers.get("content-disposition").includes("my%20image%27s.png"),
  );
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()), png);
});

test("storage failure returns a sanitized error and releases the run reservation", async (t) => {
  const f = await fixture(t);
  t.mock.method(console, "error", () => {});
  const save = f.repository.saveEvent;
  f.repository.saveEvent = async () => {
    throw new Error("private database details");
  };
  const failed = await f.post("/agent", {
    action: "start",
    operationId: randomUUID(),
    message: "Hi",
  });
  assert.equal(failed.status, 500);
  assert.equal(
    (await failed.json()).error,
    "The request could not be completed.",
  );
  f.repository.saveEvent = save;
  const next = await f.post("/agent", {
    action: "start",
    operationId: randomUUID(),
    message: "What is my name?",
  });
  assert.equal(next.status, 200);
  assert.ok((await next.text()).includes("run.completed"));
});

test("shutdown cancels and persists active work, then refuses new runs", async (t) => {
  const f = await fixture(t);
  const response = await f.post("/agent", {
    action: "start",
    operationId: randomUUID(),
    message: "Explain the Sun",
  });
  assert.equal(response.status, 200);
  await f.shutdown();
  await response.body.cancel();
  assert.ok(f.events.some((event) => event.type === "run.cancelled"));
  const next = await f.post("/agent", {
    action: "start",
    operationId: randomUUID(),
    message: "Hi",
  });
  assert.equal(next.status, 503);
});
