import express, { type ErrorRequestHandler } from "express";
import type { ConversationApplication } from "agentdock-starter-server-core";
import { createConversationController } from "./controllers/conversation-controller.ts";
import { createHealthController } from "./controllers/health-controller.ts";

export function createApp(application: ConversationApplication) {
  const app = express();

  app.use("/health", createHealthController(application.health));
  app.use(createConversationController(application.handler));
  app.use((_request, response) =>
    response.status(404).json({ error: "Route not found." }),
  );
  app.use(handleError);
  return { app, shutdown: application.shutdown };
}

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  console.error("Request failed", error);
  response.status(500).json({ error: "The request could not be completed." });
};
