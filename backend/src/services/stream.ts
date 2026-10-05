import type { Response } from "express";
import { cloneAgentEvent } from "@agentdock-ai/contracts";
import type { Repository, Runtime } from "../types.ts";

export async function streamEvents(
  response: Response,
  runtime: Runtime,
  repository: Repository,
  run: Parameters<Runtime["stream"]>[0],
  imageUrls: Map<string, string>,
) {
  try {
    for await (const original of runtime.stream(run)) {
      const event = imageUrls.size
        ? cloneAgentEvent(
            JSON.parse(
              JSON.stringify(original, (_key, value: unknown) =>
                typeof value === "string"
                  ? (imageUrls.get(value) ?? value)
                  : value,
              ),
            ),
          )
        : original;
      // Persist before sending so a disconnected client can restore partial answers.
      await repository.saveEvent(run.threadId, event);
      if (!response.destroyed && !response.writableEnded) {
        if (!response.headersSent)
          response.status(200).set({
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
          });
        if (!response.write(`data: ${JSON.stringify(event)}\n\n`))
          await waitForWritable(response, run.signal!);
      }
      if (["run.completed", "run.failed", "run.cancelled"].includes(event.type))
        break;
    }
    if (!response.headersSent && !response.destroyed)
      throw new Error("Agent event stream ended before starting.");
  } finally {
    // Let Express report pre-stream errors as JSON; finish already-started streams here.
    if (response.headersSent && !response.writableEnded) response.end();
  }
}

function waitForWritable(response: Response, signal: AbortSignal) {
  if (response.destroyed || response.writableEnded || signal.aborted)
    return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      response.off("drain", finish);
      response.off("close", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    response.once("drain", finish);
    response.once("close", finish);
    signal.addEventListener("abort", finish, { once: true });
  });
}
