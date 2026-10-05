import type { Request, Response } from "express";
import { cancelSchema, httpError, runSchema } from "../schemas.ts";
import type { AppDependencies, Runtime } from "../types.ts";
import { assertRunAction, createStartInput } from "../services/run-input.ts";
import { streamEvents } from "../services/stream.ts";

export function createAgentController({
  runtime,
  repository,
}: AppDependencies) {
  const activeRuns = new Map<
    string,
    {
      operationId: string;
      controller: AbortController;
      finished: Promise<void>;
    }
  >();
  let closing = false;
  return {
    async start(request: Request, response: Response) {
      if (closing) throw httpError(503, "The server is shutting down.");
      const body = runSchema.parse(request.body);
      const threadId = body.conversationId;
      await repository.requireThread(threadId);
      if (closing) throw httpError(503, "The server is shutting down.");
      if (activeRuns.has(threadId))
        throw httpError(409, "A run is already active.");
      const controller = new AbortController();
      const { promise: finished, resolve: finish } =
        Promise.withResolvers<void>();
      // Reserve synchronously before preparing input, preventing concurrent starts.
      const active = { operationId: body.operationId, controller, finished };
      activeRuns.set(threadId, active);
      response.once("close", () => {
        if (!response.writableEnded) controller.abort();
      });
      try {
        const [resumeState, events] = await Promise.all([
          runtime.getResumeState(threadId),
          repository.loadEvents(threadId),
        ]);
        assertRunAction(body, resumeState, events);
        const imageUrls = new Map<string, string>();
        let run: Parameters<Runtime["stream"]>[0];
        const options = { threadId, signal: controller.signal };
        if (body.action === "start") {
          if (!body.message && !body.attachments.length)
            throw httpError(400, "Send a message or attach an image.");
          const attachments = await repository.loadAttachments(
            threadId,
            body.attachments.map((item) => item.id),
          );
          for (const item of attachments)
            imageUrls.set(
              `data:${item.mimeType};base64,${item.data.toString("base64")}`,
              `/attachments/${item.id}`,
            );
          await repository.setTitle(threadId, body.message);
          run = {
            ...options,
            input: createStartInput(body, imageUrls, events),
          };
        } else if (body.action === "resume") {
          run = {
            ...options,
            resume: { [body.interruptId]: { decisions: body.decisions } },
          };
        } else {
          run = { ...options, continue: true };
        }
        await streamEvents(response, runtime, repository, run, imageUrls);
      } finally {
        try {
          await repository.touchThread(threadId);
        } finally {
          activeRuns.delete(threadId);
          finish();
        }
      }
    },
    async cancel(request: Request, response: Response) {
      const body = cancelSchema.parse(request.body);
      await repository.requireThread(body.conversationId);
      const active = activeRuns.get(body.conversationId);
      if (!active || active.operationId !== body.operationId)
        throw httpError(409, "The run is no longer active.");
      active.controller.abort();
      // Acknowledgement includes persistence and cleanup, so the next prompt is safe.
      await active.finished;
      response.status(204).end();
    },
    async wait(threadId: string) {
      await activeRuns.get(threadId)?.finished;
    },
    async shutdown() {
      closing = true;
      const runs = [...activeRuns.values()];
      for (const run of runs) run.controller.abort();
      await Promise.all(runs.map((run) => run.finished));
    },
  };
}
