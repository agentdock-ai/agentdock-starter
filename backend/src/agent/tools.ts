import { tool } from "langchain";
import { z } from "zod";
import type { createSandbox } from "./sandbox.ts";

export function createTools(sandbox: ReturnType<typeof createSandbox>) {
  return [
    tool(
      async ({ path }) => JSON.stringify(await sandbox.list(path), null, 2),
      {
        name: "list_files",
        description:
          "List files and folders in the .sandbox workspace. Paths are relative to its root.",
        schema: z.object({ path: z.string().default(".") }),
      },
    ),
    tool(async ({ path }) => sandbox.read(path), {
      name: "read_file",
      description:
        "Read a UTF-8 text file in .sandbox. Use this before editing an existing file.",
      schema: z.object({ path: z.string().min(1) }),
    }),
    tool(
      async ({ path, content }) =>
        JSON.stringify(await sandbox.write(path, content)),
      {
        name: "write_file",
        description:
          "Create or replace a UTF-8 text file in .sandbox, creating parent folders as needed. Maximum file size is 256 KB.",
        schema: z.object({
          path: z.string().min(1),
          content: z.string().max(256 * 1024),
        }),
      },
    ),
    tool(async ({ path }) => JSON.stringify(await sandbox.delete(path)), {
      name: "delete_file",
      description:
        "Delete one regular file in .sandbox. Requires user approval; folders cannot be deleted.",
      schema: z.object({ path: z.string().min(1) }),
    }),
    tool(async ({ file }) => sandbox.run(file), {
      name: "run_command",
      description:
        "Run a .mjs script in .sandbox with the restricted Node runtime. Requires user approval. No network or child processes; 10-second and 64 KB output limits.",
      schema: z.object({ file: z.string().min(1).endsWith(".mjs") }),
    }),
  ];
}
