import { Router } from "express";
import { Readable } from "node:stream";

type ConversationHandler = (request: Request) => Promise<Response>;

export function createConversationController(handler: ConversationHandler) {
  const router = Router();

  router.use(async (request, response, next) => {
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
        new Request(`http://localhost${request.originalUrl}`, init),
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

  return router;
}
