import { once } from "node:events";
import { createApp } from "../src/app.ts";

export async function startExpressServer(application) {
  const { app, shutdown } = createApp(application);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await Promise.all([
        shutdown(),
        new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
      ]);
    },
  };
}
