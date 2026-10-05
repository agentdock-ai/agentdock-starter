import type { AgentEvent, AgentReducerState } from "@agentdock-ai/contracts";
import type { BaseMessageLike } from "@langchain/core/messages";
import { httpError, type RunRequest } from "../schemas.ts";
import { wasStopped } from "./history.ts";

export const SUPERSEDE_MESSAGE =
  "The previous response was stopped. The next user message is a new request and supersedes that unfinished response. Answer the latest request only; do not continue earlier work unless the user explicitly asks to continue it.";

export function createStartInput(
  body: Extract<RunRequest, { action: "start" }>,
  imageData: Map<string, string>,
  events: AgentEvent[],
) {
  const messages: BaseMessageLike[] = [];
  if (wasStopped(events))
    messages.push({
      id: `${body.operationId}:supersede`,
      role: "system",
      content: SUPERSEDE_MESSAGE,
    });
  messages.push({
    id: body.operationId,
    role: "user",
    content: [
      ...(body.message ? [{ type: "text", text: body.message }] : []),
      ...[...imageData.keys()].map((url) => ({
        type: "image_url",
        image_url: { url },
      })),
    ],
  });
  return { messages };
}

export function availableResumeState(
  resumeState: AgentReducerState | null,
  events: AgentEvent[],
) {
  // Approval decisions remain authoritative even after a transport cancellation.
  if (resumeState?.interrupts.length) return resumeState;
  return wasStopped(events) ? null : resumeState;
}

export function assertRunAction(
  body: RunRequest,
  resumeState: AgentReducerState | null,
  events: AgentEvent[],
) {
  if (body.action === "start" && resumeState?.interrupts.length)
    throw httpError(
      409,
      "Resolve the pending approval before sending another message.",
    );
  if (
    body.action === "resume" &&
    !resumeState?.interrupts.some(
      (interrupt) => interrupt.interruptId === body.interruptId,
    )
  )
    throw httpError(409, "This approval is no longer pending.");
  if (
    body.action === "continue" &&
    (!availableResumeState(resumeState, events) ||
      resumeState?.interrupts.length)
  )
    throw httpError(
      409,
      "This run cannot be continued. Send a new message or resolve its approval.",
    );
}
