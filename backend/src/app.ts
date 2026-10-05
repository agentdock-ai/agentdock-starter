import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import type { AppDependencies } from "./types.ts";
import { createAgentController } from "./controllers/agent.ts";
import { createThreadController } from "./controllers/threads.ts";
import { createAttachmentController } from "./controllers/attachments.ts";

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const agent = createAgentController(dependencies);
  const threads = createThreadController(dependencies, agent.wait);
  const attachments = createAttachmentController(dependencies.repository);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  app.use(express.json({ limit: "64kb" }));
  app.get("/health", async (_request, response) => {
    await dependencies.repository.health();
    response.json({ status: "ok", database: "connected" });
  });
  app.get("/threads", threads.list);
  app.post("/threads", threads.create);
  app.get("/threads/:threadId", threads.get);
  app.get("/threads/:threadId/messages", threads.messages);
  app.post("/attachments", upload.single("file"), attachments.upload);
  app.get("/attachments/:attachmentId", attachments.get);
  app.post("/agent", agent.start);
  app.post("/agent/cancel", agent.cancel);
  app.use((_request, response) =>
    response.status(404).json({ error: "Route not found." }),
  );
  app.use(handleError);
  return { app, shutdown: agent.shutdown };
}

const handleError: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (response.headersSent) {
    console.error("Stream failed", error);
    response.end();
    return;
  }
  let status = 500;
  if (error instanceof ZodError) status = 400;
  else if (error instanceof multer.MulterError)
    status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  else if (typeof error === "object" && error !== null && "status" in error) {
    const code = Number(error.status);
    if ([400, 404, 409, 413, 415, 503].includes(code)) status = code;
  }
  let message = "Invalid request.";
  if (status === 500) message = "The request could not be completed.";
  else if (status === 413) message = "Image or request is too large.";
  else if (status !== 400 && error instanceof Error) message = error.message;
  if (status === 500) console.error("Request failed", error);
  response.status(status).json({ error: message });
};
