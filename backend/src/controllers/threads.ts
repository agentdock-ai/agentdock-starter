import type { Request, Response } from "express";
import { idSchema } from "../schemas.ts";
import type { AppDependencies } from "../types.ts";
import { availableResumeState } from "../services/run-input.ts";
import {
  readCheckpointMessageTimes,
  restoreTranscript,
} from "../services/history.ts";

export function createThreadController(
  { runtime, repository, checkpointer }: AppDependencies,
  waitForRun: (id: string) => Promise<void>,
) {
  return {
    async list(_request: Request, response: Response) {
      response.json({ threads: await repository.listThreads() });
    },
    async create(_request: Request, response: Response) {
      response.status(201).json({ thread: await repository.createThread() });
    },
    async get(request: Request, response: Response) {
      response.json({
        thread: await repository.requireThread(
          idSchema.parse(request.params.threadId),
        ),
      });
    },
    async messages(request: Request, response: Response) {
      const threadId = idSchema.parse(request.params.threadId);
      await repository.requireThread(threadId);
      await waitForRun(threadId);
      const [messages, resumeState, attachments, events, times] =
        await Promise.all([
          runtime.getMessages(threadId),
          runtime.getResumeState(threadId),
          repository.listAttachments(threadId),
          repository.loadEvents(threadId),
          readCheckpointMessageTimes(checkpointer, threadId),
        ]);
      const imageUrls = new Map(
        attachments.map((item) => [
          `data:${item.mimeType};base64,${item.data.toString("base64")}`,
          `/attachments/${item.id}`,
        ]),
      );
      response.json({
        threadId,
        messages: restoreTranscript(messages, events, times, imageUrls),
        resumeState: availableResumeState(resumeState, events),
      });
    },
  };
}
