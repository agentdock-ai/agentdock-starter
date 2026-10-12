import {
  All,
  Controller,
  DynamicModule,
  Get,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
  Req,
  Res,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  NodeHttpAdapter,
  type ConversationApplication,
} from "agentdock-starter-server-core";

const SERVER_CORE = Symbol("SERVER_CORE");

@Controller()
class HealthController {
  constructor(
    @Inject(SERVER_CORE)
    private readonly application: ConversationApplication,
  ) {}

  @Get("health")
  async health(@Res() response: ServerResponse) {
    try {
      await this.application.health();
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "ok", database: "connected" }));
    } catch {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({ error: "The request could not be completed." }),
      );
    }
  }
}

@Controller()
class ConversationController {
  private readonly adapter: NodeHttpAdapter;

  constructor(
    @Inject(SERVER_CORE)
    application: ConversationApplication,
  ) {
    this.adapter = new NodeHttpAdapter(application.handler);
  }

  @All("*")
  handle(
    @Req() request: IncomingMessage & { originalUrl?: string },
    @Res() response: ServerResponse,
  ) {
    return this.adapter
      .handle(request, response, request.originalUrl ?? request.url ?? "/")
      .catch((error: unknown) => {
        console.error("Request bridge failed", error);
        if (response.destroyed) return;
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined);
          return;
        }
        response.statusCode = 500;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(
          JSON.stringify({ error: "The request could not be completed." }),
        );
      });
  }
}

@Injectable()
class CoreLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(SERVER_CORE)
    private readonly application: ConversationApplication,
  ) {}

  async onApplicationShutdown() {
    await this.application.shutdown();
  }
}

@Module({})
export class AppModule {
  static withApplication(application: ConversationApplication): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ConversationController],
      providers: [
        { provide: SERVER_CORE, useValue: application },
        CoreLifecycle,
      ],
    };
  }
}
