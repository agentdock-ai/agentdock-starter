import Fastify from "fastify";
import {
  NodeHttpAdapter,
  type ConversationApplication,
} from "agentdock-starter-server-core";

export function createApp(application: ConversationApplication) {
  const app = Fastify({ routerOptions: { ignoreTrailingSlash: true } });
  const adapter = new NodeHttpAdapter(application.handler);

  app.addHook("onRequest", async (request, reply) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/health" || pathname === "/health/") return;

    reply.hijack();
    try {
      await adapter.handle(
        request.raw,
        reply.raw,
        request.raw.url ?? request.url,
      );
    } catch (error) {
      app.log.error({ err: error }, "Request bridge failed");
      if (reply.raw.destroyed) return;
      if (reply.raw.headersSent) {
        reply.raw.destroy(error instanceof Error ? error : undefined);
        return;
      }
      reply.raw.statusCode = 500;
      reply.raw.setHeader("content-type", "application/json; charset=utf-8");
      reply.raw.end(
        JSON.stringify({ error: "The request could not be completed." }),
      );
    }
  });

  app.get("/health", async (_request, reply) => {
    try {
      await application.health();
      return reply.send({ status: "ok", database: "connected" });
    } catch (error) {
      app.log.error({ err: error }, "Health check failed");
      return reply.code(500).send({
        error: "The request could not be completed.",
      });
    }
  });

  app.all("/*", async (_request, reply) => reply.callNotFound());
  app.all("/", async (_request, reply) => reply.callNotFound());

  return app;
}
