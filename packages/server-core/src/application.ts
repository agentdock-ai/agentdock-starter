import {
  ConversationService,
  createConversationHttpHandler,
} from "@agentdock-ai/conversations";
import type { AppDependencies } from "./types.ts";

export function createConversationApplication(dependencies: AppDependencies) {
  const conversations = new ConversationService({
    runtime: dependencies.runtime,
    store: dependencies.store,
    fileStorage: dependencies.fileStorage,
    prepareInput: (context) =>
      dependencies.prepareInput(context.prompt, context.attachments),
  });
  const handler = createConversationHttpHandler({
    service: conversations,
    // The demo actor comes from trusted server configuration, never request input.
    resolveActor: () => dependencies.actorId,
  });

  return {
    handler,
    health: dependencies.health,
    shutdown: () => conversations.shutdown(),
  };
}

export type ConversationApplication = ReturnType<
  typeof createConversationApplication
>;
