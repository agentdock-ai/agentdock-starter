import { ChatOpenRouter } from "@langchain/openrouter";
import { Agentdock, validateToolApprovalResume } from "@agentdock-ai/agentdock";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { SandboxService } from "./sandbox.ts";
import { createTools } from "./tools.ts";

interface RuntimeOptions {
  checkpointer: BaseCheckpointSaver;
  sandbox: SandboxService;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

export function createRuntime({
  checkpointer,
  sandbox,
  apiKey,
  model,
  systemPrompt,
}: RuntimeOptions) {
  const agent = createAgent({
    model: new ChatOpenRouter({
      model,
      apiKey,
    }),
    tools: createTools(sandbox),
    checkpointer,
    systemPrompt,
    middleware: [
      humanInTheLoopMiddleware({
        interruptOn: { delete_file: true, run_command: true },
      }),
    ],
  });

  return new Agentdock(agent.graph, {
    interruptFormat: Agentdock.HITL,
    validateResume: validateToolApprovalResume,
    onError(error, details) {
      console.error("Agent run failed", details, error);
    },
  });
}
