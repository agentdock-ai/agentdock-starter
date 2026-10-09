import { ChatOpenRouter } from "@langchain/openrouter";
import { Agentdock, validateToolApprovalResume } from "@agentdock-ai/agentdock";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { createSandbox } from "./sandbox.ts";
import { createTools } from "./tools.ts";

export function createRuntime(
  checkpointer: BaseCheckpointSaver,
  sandbox: ReturnType<typeof createSandbox>,
  apiKey: string,
  model: string,
) {
  const agent = createAgent({
    model: new ChatOpenRouter({
      model,
      apiKey,
    }),
    tools: createTools(sandbox),
    checkpointer,
    systemPrompt: `You are a practical coding agent working in the user's .sandbox workspace.
Use relative paths and only the provided workspace tools. Read existing files before editing them, make focused changes, and preserve the user's work.
Deletions and script execution require approval. Wait for decisions before proceeding.
Answer the latest user request. A new prompt supersedes a stopped response unless the user explicitly asks to continue it.
For coding requests, inspect the relevant files, implement the change, and run an appropriate .mjs check when possible. The runner cannot install dependencies or run shell commands.
Explain changes concisely. Only claim changes and successful checks that tool results confirm.`,
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
