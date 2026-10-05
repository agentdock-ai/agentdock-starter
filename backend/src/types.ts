import type { AgentEvent, AgentReducerState } from "@agentdock-ai/contracts";
import type { Run } from "@agentdock-ai/agentdock";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { createRepository } from "./repository.ts";
import type { createStartInput } from "./services/run-input.ts";

export interface Runtime {
  stream(
    run: Run<ReturnType<typeof createStartInput>, Record<string, unknown>>,
  ): AsyncIterable<AgentEvent>;
  getMessages(threadId: string): Promise<unknown[] | null>;
  getResumeState(threadId: string): Promise<AgentReducerState | null>;
}

export type Repository = ReturnType<typeof createRepository>;
export type CheckpointReader = Pick<BaseCheckpointSaver, "list">;
export interface AppDependencies {
  runtime: Runtime;
  repository: Repository;
  checkpointer: CheckpointReader;
}
