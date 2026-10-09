import { Router } from "express";
import { NodeHttpAdapter, type FetchHandler } from "@agentdock-ai/agentdock";

export function createConversationController(handler: FetchHandler) {
  const router = Router();
  const adapter = new NodeHttpAdapter(handler);

  router.use((request, response, next) => {
    void adapter.handle(request, response, request.originalUrl).catch(next);
  });

  return router;
}
