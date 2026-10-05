import assert from "node:assert/strict";
import test from "node:test";
import {
  availableResumeState,
  assertRunAction,
  createStartInput,
  SUPERSEDE_MESSAGE,
} from "../src/services/run-input.ts";
import { interrupted, sequence } from "./event-fixtures.js";

const pause = {
  status: "waiting",
  pausedNodes: ["model_request"],
  interrupts: [],
};
const events = interrupted("r", "a", "The Sun", 1000);

test("a fresh prompt after stopping explicitly supersedes the abandoned response", () => {
  const input = createStartInput(
    { operationId: "op", message: "What is my name?" },
    new Map(),
    events,
  );
  assert.deepEqual(input.messages, [
    { id: "op:supersede", role: "system", content: SUPERSEDE_MESSAGE },
    {
      id: "op",
      role: "user",
      content: [{ type: "text", text: "What is my name?" }],
    },
  ]);
  assert.equal(availableResumeState(pause, events), null);
  assert.doesNotThrow(() =>
    assertRunAction({ action: "start" }, pause, events),
  );
  assert.throws(() => assertRunAction({ action: "continue" }, pause, events), {
    status: 409,
  });
});

test("ordinary and image-only new prompts preserve native input shape", () => {
  assert.deepEqual(
    createStartInput(
      { operationId: "op", message: "" },
      new Map([["data:image/png;base64,eA==", "/attachments/x"]]),
      [],
    ).messages,
    [
      {
        id: "op",
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,eA==" },
          },
        ],
      },
    ],
  );
});

test("genuine static pauses remain continuable while completed threads cannot continue", () => {
  const paused = sequence([
    { type: "run.started" },
    { type: "run.paused", next: ["node"] },
  ]);
  assert.equal(availableResumeState(pause, paused), pause);
  assert.doesNotThrow(() =>
    assertRunAction({ action: "continue" }, pause, paused),
  );
  assert.throws(() => assertRunAction({ action: "continue" }, null, []), {
    status: 409,
  });
});

test("native approvals survive stops and prevent bypass through new prompts or static continuation", () => {
  const approval = { ...pause, interrupts: [{ interruptId: "approval" }] };
  assert.equal(availableResumeState(approval, events), approval);
  assert.throws(() => assertRunAction({ action: "start" }, approval, events), {
    status: 409,
  });
  assert.throws(
    () => assertRunAction({ action: "continue" }, approval, events),
    { status: 409 },
  );
  assert.doesNotThrow(() =>
    assertRunAction(
      { action: "resume", interruptId: "approval" },
      approval,
      events,
    ),
  );
  assert.throws(
    () =>
      assertRunAction(
        { action: "resume", interruptId: "stale" },
        approval,
        events,
      ),
    { status: 409 },
  );
});
