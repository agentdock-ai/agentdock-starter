import { registerHttpConformanceTests } from "../../../packages/server-core/test-support/http-conformance.js";
import { createApp } from "../src/app.ts";

registerHttpConformanceTests("Fastify", async (application) => {
  const app = createApp(application);
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return {
    base: address,
    async close() {
      app.server.closeAllConnections();
      await Promise.all([app.close(), application.shutdown()]);
    },
  };
});
