import { z } from "zod";

export const idSchema = z.string().uuid();
const operation = { conversationId: idSchema, operationId: idSchema };

export const runSchema = z.discriminatedUnion("action", [
  z.object({
    ...operation,
    action: z.literal("start"),
    message: z.string().trim().max(8_000),
    attachments: z
      .array(z.object({ id: idSchema }))
      .max(4)
      .default([]),
  }),
  z.object({
    ...operation,
    action: z.literal("resume"),
    interruptId: z.string().min(1),
    decisions: z.array(z.unknown()).min(1),
  }),
  z.object({ ...operation, action: z.literal("continue") }),
]);

export const cancelSchema = z.object(operation);
export type RunRequest = z.infer<typeof runSchema>;

export function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
