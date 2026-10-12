import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDatabase } from "./database.ts";
import { createRuntime } from "./agent/runtime.ts";
import { SandboxService } from "./agent/sandbox.ts";
import { createStartInput } from "./services/run-input.ts";
import { checkDatabaseConnection } from "./models/health-model.ts";
import { createConversationApplication } from "./application.ts";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  DEMO_USER_ID: z.string().min(1).default("local-demo-user"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type ServerConfig = z.infer<typeof environmentSchema>;

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env) {
  return environmentSchema.parse(environment);
}

export async function createServerCore(config = readServerConfig()) {
  const [systemPrompt, sandbox] = await Promise.all([
    readFile(new URL("../prompts/assistant.md", import.meta.url), "utf8"),
    SandboxService.create(
      fileURLToPath(new URL("../../../.sandbox", import.meta.url)),
    ),
  ]);

  const database = await createDatabase(config.DATABASE_URL);
  let application: ReturnType<typeof createConversationApplication>;
  try {
    application = createConversationApplication({
      runtime: createRuntime({
        checkpointer: database.checkpointer,
        sandbox,
        apiKey: config.OPENROUTER_API_KEY,
        model: config.OPENROUTER_MODEL,
        systemPrompt,
        braveSearchApiKey: config.BRAVE_SEARCH_API_KEY,
      }),
      store: database.store,
      fileStorage: database.fileStorage,
      actorId: config.DEMO_USER_ID,
      prepareInput: (prompt, attachments) =>
        createStartInput(prompt, attachments),
      health: () => checkDatabaseConnection(database.pool),
    });
  } catch (error) {
    await database.close();
    throw error;
  }

  let isShutdown = false;
  return {
    ...application,
    config,
    async shutdown() {
      if (isShutdown) return;
      isShutdown = true;
      try {
        await application.shutdown();
      } finally {
        await database.close();
      }
    },
  };
}
