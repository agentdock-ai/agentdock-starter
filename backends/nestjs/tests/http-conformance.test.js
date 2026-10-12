import { NestFactory } from "@nestjs/core";
import { registerHttpConformanceTests } from "../../../packages/server-core/test-support/http-conformance.js";
import { AppModule } from "../dist/app.module.js";

registerHttpConformanceTests("NestJS", async (application) => {
  const app = await NestFactory.create(AppModule.withApplication(application), {
    bodyParser: false,
    logger: false,
  });
  await app.listen(0, "127.0.0.1");
  const server = app.getHttpServer();
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await app.close();
    },
  };
});
