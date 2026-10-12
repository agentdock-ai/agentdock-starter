import { createServerCore } from "agentdock-starter-server-core";
import { createApp } from "./app.ts";

const core = await createServerCore();
const app = createApp(core);

try {
  const address = await app.listen({
    port: core.config.PORT,
    host: "127.0.0.1",
  });
  console.info(`AgentDock Fastify backend: ${address}`);
} catch (error) {
  console.error("Could not start the backend", error);
  await app.close();
  await core.shutdown();
  process.exitCode = 1;
}

let closing: Promise<void> | undefined;
async function stop() {
  if (closing) return closing;
  closing = (async () => {
    const deadline = setTimeout(() => {
      app.server.closeAllConnections();
      process.exit(1);
    }, 10_000).unref();
    try {
      await Promise.all([app.close(), core.shutdown()]);
    } catch (error) {
      console.error("Backend shutdown failed", error);
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  })();
  return closing;
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void stop());
