import assert from "node:assert/strict";
import test from "node:test";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { normalizeMessages } from "../src/services/history.ts";

test("normalizes native and serialized checkpoint messages with their real IDs", () => {
  const messages = [
    new HumanMessage({ id: "user", content: "Hello" }),
    new AIMessage({ id: "assistant", content: "Hi" }),
  ];
  const expected = [
    {
      messageId: "user",
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    },
    {
      messageId: "assistant",
      role: "assistant",
      content: [{ type: "text", text: "Hi" }],
    },
  ];
  assert.deepEqual(normalizeMessages(messages), expected);
  assert.deepEqual(
    normalizeMessages(JSON.parse(JSON.stringify(messages))),
    expected,
  );
});
test("restores image-only input as an app-owned attachment URL", () => {
  const url = "data:image/png;base64,aW1hZ2U=";
  const messages = [
    new HumanMessage({
      id: "image",
      content: [{ type: "image_url", image_url: { url } }],
    }),
  ];
  assert.deepEqual(
    normalizeMessages(messages, new Map([[url, "/attachments/image"]]))[0]
      .content,
    [{ type: "image", url: "/attachments/image" }],
  );
});
test("preserves tool arguments, native call IDs, outputs, and errors", () => {
  const messages = [
    new HumanMessage({ id: "u", content: "Read" }),
    new AIMessage({
      id: "a",
      content: "",
      tool_calls: [
        {
          id: "call",
          name: "read_file",
          args: { path: "x" },
          type: "tool_call",
        },
      ],
    }),
    new ToolMessage({
      id: "t",
      tool_call_id: "call",
      content: "Failed",
      status: "error",
    }),
  ];
  const normalized = normalizeMessages(messages);
  assert.equal(normalized[1].content[0].toolCall.toolCallId, "call");
  assert.deepEqual(normalized[2].content[0].result, {
    toolCallId: "call",
    name: "read_file",
    input: { path: "x" },
    output: "Failed",
    isError: true,
  });
});
test("refuses messages without native IDs instead of inventing identity", () => {
  assert.throws(
    () => normalizeMessages([{ role: "user", content: "No ID" }]),
    /native message ID/,
  );
});

import {
  readCheckpointMessageTimes,
  restoreTranscript,
  wasStopped,
} from "../src/services/history.ts";
import { interrupted, sequence } from "./event-fixtures.js";

test("restores successive interrupted replies under their own prompts in native order", () => {
  const native = [
    new HumanMessage({ id: "sun", content: "Explain the Sun" }),
    new HumanMessage({ id: "continue", content: "continue" }),
    new HumanMessage({ id: "name", content: "What is my name?" }),
  ];
  const events = [
    ...interrupted("r1", "a1", "The Sun moves", 1000),
    ...interrupted("r2", "a2", "It orbits the galaxy", 2000),
    ...interrupted("r3", "a3", "Your name is Zain", 3000),
  ];
  const times = new Map([
    ["sun", 999],
    ["continue", 1999],
    ["name", 2999],
  ]);
  const restored = restoreTranscript(native, events, times);
  assert.deepEqual(
    restored.map((m) => m.messageId),
    ["sun", "a1", "continue", "a2", "name", "a3"],
  );
  assert.deepEqual(
    restored.filter((m) => m.role === "assistant").map((m) => m.state),
    ["stopped", "stopped", "stopped"],
  );
  assert.equal(restored[1].content[0].text, "The Sun moves");
  assert.equal(wasStopped(events), true);
});

test("retains checkpoint content once and inserts a stopped fragment before a later completed answer", () => {
  const native = [
    new HumanMessage({ id: "u", content: "Prompt" }),
    new AIMessage({ id: "complete", content: "Complete answer" }),
  ];
  const events = [
    ...interrupted("r1", "partial", "Partial", 1000),
    ...sequence(
      [
        { type: "run.started" },
        {
          type: "message.completed",
          messageId: "complete",
          role: "assistant",
          content: [{ type: "text", text: "Complete answer" }],
        },
        { type: "run.completed", finishReason: "stop", content: [] },
      ],
      "r2",
      2000,
    ),
  ];
  const restored = restoreTranscript(
    native,
    events,
    new Map([
      ["u", 999],
      ["complete", 2001],
    ]),
  );
  assert.deepEqual(
    restored.map((m) => m.messageId),
    ["u", "partial", "complete"],
  );
  assert.equal(restored[2].state, undefined);
  assert.equal(wasStopped(events), false);
});

test("preserves failed partial content, drops empty assistant placeholders, and requires an authoritative user anchor", () => {
  const native = [new HumanMessage({ id: "u", content: "Prompt" })];
  const events = sequence([
    { type: "run.started" },
    { type: "message.started", messageId: "empty", role: "assistant" },
    { type: "message.started", messageId: "partial", role: "assistant" },
    {
      type: "message.part.delta",
      messageId: "partial",
      part: { type: "text", text: "Partial" },
    },
    { type: "run.failed", code: "model", message: "Failed" },
  ]);
  assert.equal(
    restoreTranscript(native, events, new Map([["u", 999]]))[1].state,
    "error",
  );
  assert.throws(
    () => restoreTranscript(native, events, new Map()),
    /no native checkpoint user/,
  );
});

test("distinguishes native pauses, empty histories and disconnected invocations from user stops", () => {
  assert.equal(wasStopped([]), false);
  assert.equal(
    wasStopped(
      sequence([
        { type: "run.started" },
        { type: "run.paused", next: ["node"] },
      ]),
    ),
    false,
  );
  assert.equal(wasStopped(sequence([{ type: "run.started" }])), true);
});

test("reads the earliest native message introduction time across root checkpoints", async () => {
  let received;
  const saver = {
    async *list(config) {
      received = config;
      yield {
        checkpoint: {
          ts: new Date(2000).toISOString(),
          channel_values: {
            messages: [new HumanMessage({ id: "u", content: "Prompt" })],
          },
        },
      };
      yield {
        checkpoint: {
          ts: new Date(1000).toISOString(),
          channel_values: {
            messages: JSON.parse(
              JSON.stringify([
                new HumanMessage({ id: "u", content: "Prompt" }),
              ]),
            ),
          },
        },
      };
    },
  };
  assert.deepEqual(
    await readCheckpointMessageTimes(saver, "thread"),
    new Map([["u", 1000]]),
  );
  assert.deepEqual(received.configurable, {
    thread_id: "thread",
    checkpoint_ns: "",
  });
  await assert.rejects(
    readCheckpointMessageTimes(
      {
        async *list() {
          yield { checkpoint: { ts: "bad", channel_values: {} } };
        },
      },
      "thread",
    ),
    /timestamp/,
  );
});
