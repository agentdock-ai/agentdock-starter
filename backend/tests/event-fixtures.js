import { AGENT_EVENT_PROTOCOL_VERSION } from "@agentdock-ai/contracts";
export function sequence(inputs, runId = "run", time = 1000) {
  return inputs.map((input, index) => ({
    protocolVersion: AGENT_EVENT_PROTOCOL_VERSION,
    eventId: `${runId}:${index + 1}`,
    runId,
    phaseId: "phase",
    sequence: index + 1,
    logicalSequence: index + 1,
    timestamp: new Date(time + index).toISOString(),
    ...input,
  }));
}
export function interrupted(runId, messageId, text, time) {
  return sequence(
    [
      { type: "run.started" },
      { type: "message.started", messageId, role: "assistant" },
      { type: "message.part.delta", messageId, part: { type: "text", text } },
      { type: "run.paused", next: ["model_request"] },
      { type: "run.cancelled", recoverable: true },
    ],
    runId,
    time,
  );
}
