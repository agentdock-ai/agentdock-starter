import { createServerCore } from "agentdock-starter-server-core";
import { createApp } from "./app.ts";

const core = await createServerCore();
const { app } = createApp(core);
const server = app.listen(core.config.PORT, "127.0.0.1", () => {
  console.info(
    `AgentDock Express backend: http://127.0.0.1:${core.config.PORT}`,
  );
});
server.once("error", (error) => {
  console.error("Could not start the backend", error);
  void core.shutdown().finally(() => {
    process.exitCode = 1;
  });
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
      core.shutdown(),
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    ]);
  } catch (error) {
    console.error("Backend shutdown failed", error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void stop());
