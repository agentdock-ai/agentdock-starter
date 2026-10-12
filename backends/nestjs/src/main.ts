import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createServerCore } from "agentdock-starter-server-core";
import { AppModule } from "./app.module.js";

const core = await createServerCore();
let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
let isListening = false;

try {
  app = await NestFactory.create(AppModule.withApplication(core), {
    bodyParser: false,
  });
  await app.listen(core.config.PORT, "127.0.0.1");
  console.info(
    `AgentDock NestJS backend: http://127.0.0.1:${core.config.PORT}`,
  );
  isListening = true;
} catch (error) {
  console.error("Could not start the backend", error);
  try {
    if (app) await app.close();
  } finally {
    await core.shutdown();
  }
  process.exitCode = 1;
}

if (app && isListening) {
  let closing: Promise<void> | undefined;
  const stop = () => {
    if (closing) return;
    closing = (async () => {
      const server = app!.getHttpServer();
      const deadline = setTimeout(() => {
        server.closeAllConnections();
        process.exit(1);
      }, 10_000).unref();
      try {
        await app!.close();
      } catch (error) {
        console.error("Backend shutdown failed", error);
        process.exitCode = 1;
      } finally {
        clearTimeout(deadline);
      }
    })();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, stop);
}
