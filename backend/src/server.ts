import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { createApp } from "./app.ts";
import { createDatabase } from "./database.ts";
import { createRuntime } from "./agent/runtime.ts";
import { SandboxService } from "./agent/sandbox.ts";
import { createStartInput } from "./services/run-input.ts";
import { checkDatabaseConnection } from "./models/health-model.ts";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
    BRAVE_SEARCH_API_KEY: z.string().optional(),
    DEMO_USER_ID: z.string().min(1).default("local-demo-user"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .parse(process.env);

const systemPrompt = await readFile(
  new URL("../prompts/assistant.md", import.meta.url),
  "utf8",
);
const sandbox = await SandboxService.create(
  fileURLToPath(new URL("../.sandbox", import.meta.url)),
);
const database = await createDatabase(env.DATABASE_URL);
const { app, shutdown } = createApp({
  runtime: createRuntime({
    checkpointer: database.checkpointer,
    sandbox,
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    systemPrompt,
    braveSearchApiKey: env.BRAVE_SEARCH_API_KEY,
  }),
  store: database.store,
  fileStorage: database.fileStorage,
  actorId: env.DEMO_USER_ID,
  prepareInput: (prompt, attachments) => createStartInput(prompt, attachments),
  health: () => checkDatabaseConnection(database.pool),
});
const server = app.listen(env.PORT, "127.0.0.1", () => {
  console.info(`AgentDock backend: http://127.0.0.1:${env.PORT}`);
});
server.once("error", async (error) => {
  console.error("Could not start the backend", error);
  await database.close();
  process.exitCode = 1;
});

let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  // Give cooperative runs time to persist cancellation; bound shutdown if a dependency hangs.
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10_000).unref();
  try {
    await Promise.all([
      shutdown(),
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    ]);
    await database.close();
  } catch (error) {
    console.error("Backend shutdown failed", error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void stop());
