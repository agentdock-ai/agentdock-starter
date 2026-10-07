import express, { type ErrorRequestHandler } from "express";
import { Readable } from "node:stream";
import {
  createConversationHttpHandler,
  ConversationService,
} from "@agentdock-ai/conversations";
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

  app.get("/health", async (_request, response, next) => {
    try {
      await dependencies.health();
      response.json({ status: "ok", database: "connected" });
    } catch (error) {
      next(error);
    }
  });
  app.use("/conversations", async (request, response, next) => {
    try {
      const controller = new AbortController();
      response.once("close", () => {
        if (!response.writableEnded) controller.abort();
      });
      request.once("aborted", () => controller.abort());
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(", "));
      }
      const path = request.originalUrl;
      const init: RequestInit & { duplex?: "half" } = {
        method: request.method,
        headers,
        signal: controller.signal,
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
        init.duplex = "half";
      }
      const result = await handler(
        new Request(`http://localhost${path}`, init),
      );
      response.status(result.status);
      result.headers.forEach((value, name) => response.setHeader(name, value));
      if (!result.body) {
        response.end();
        return;
      }
      Readable.fromWeb(
        result.body as import("node:stream/web").ReadableStream,
      ).pipe(response);
    } catch (error) {
      next(error);
    }
  });
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
