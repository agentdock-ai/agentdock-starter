import express, { type ErrorRequestHandler } from "express";
import {
  createConversationHttpHandler,
  ConversationService,
} from "@agentdock-ai/conversations";
import { createConversationController } from "./controllers/conversation-controller.ts";
import { createHealthController } from "./controllers/health-controller.ts";
import type { AppDependencies } from "./types.ts";

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const conversations = new ConversationService({
    runtime: dependencies.runtime,
    store: dependencies.store,
    fileStorage: dependencies.fileStorage,
    prepareInput: (context) =>
      dependencies.prepareInput(context.prompt, context.attachments),
  });
  const handler = createConversationHttpHandler({
    service: conversations,
    // This demo's identity is trusted server configuration, never request input.
    resolveActor: () => dependencies.actorId,
  });

  app.use("/health", createHealthController(dependencies.health));
  app.use(createConversationController(handler));
  app.use((_request, response) =>
    response.status(404).json({ error: "Route not found." }),
  );
  app.use(handleError);
  return { app, shutdown: () => conversations.shutdown() };
}

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  console.error("Request failed", error);
  response.status(500).json({ error: "The request could not be completed." });
};
