import type {
  ConversationInputAttachment,
  ConversationStore,
  ConversationFileStorage,
} from "@agentdock-ai/conversations";
import type { ConversationRuntime } from "@agentdock-ai/conversations";
import type { createStartInput } from "./services/run-input.ts";

export interface AppDependencies {
  runtime: ConversationRuntime<ReturnType<typeof createStartInput>>;
  store: ConversationStore;
  fileStorage: ConversationFileStorage;
  actorId: string;
  prepareInput(
    prompt: string,
    attachments: readonly ConversationInputAttachment[],
  ): ReturnType<typeof createStartInput>;
  health(): Promise<void>;
}
