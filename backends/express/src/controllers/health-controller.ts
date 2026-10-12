import { Router } from "express";

export function createHealthController(checkHealth: () => Promise<void>) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      await checkHealth();
      response.json({ status: "ok", database: "connected" });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
