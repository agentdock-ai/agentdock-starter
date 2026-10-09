import { tool } from "langchain";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { calculate } from "./calculator.ts";
import type { SandboxService } from "./sandbox.ts";
import { createWebTools } from "./web-tools.ts";

export function createTools(
  sandbox: SandboxService,
  options: { braveSearchApiKey?: string } = {},
) {
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
      async ({ query, path }) =>
        JSON.stringify(await sandbox.search(query, path), null, 2),
      {
        name: "search_files",
        description:
          "Search text in regular UTF-8 files in the .sandbox workspace. The search is capped at 500 entries, 8 MB, and 40 matches; .git and node_modules are skipped.",
        schema: z.object({
          query: z.string().trim().min(1).max(200),
          path: z.string().default("."),
        }),
      },
    ),
    tool(
      async ({ path, oldText, newText }) =>
        JSON.stringify(await sandbox.edit(path, oldText, newText)),
      {
        name: "edit_file",
        description:
          "Replace one exact text match in an existing .sandbox file. The target must occur exactly once; read the file first. Maximum file size is 256 KB.",
        schema: z.object({
          path: z.string().min(1),
          oldText: z
            .string()
            .min(1)
            .max(256 * 1024),
          newText: z.string().max(256 * 1024),
        }),
      },
    ),
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
    tool(
      async ({ file }, config: RunnableConfig) =>
        sandbox.run(file, config.signal),
      {
        name: "run_command",
        description:
          "Run a .mjs script in .sandbox with the restricted Node runtime. Requires user approval. No network or child processes; 10-second and 64 KB output limits.",
        schema: z.object({ file: z.string().min(1).endsWith(".mjs") }),
      },
    ),
    tool(
      async ({ expression }) =>
        JSON.stringify({ expression, result: calculate(expression) }),
      {
        name: "calculator",
        description:
          "Evaluate basic arithmetic with parentheses and +, -, *, /, %, and ^. Does not execute code or support variables or functions.",
        schema: z.object({ expression: z.string().trim().min(1).max(200) }),
      },
    ),
    ...createWebTools(options.braveSearchApiKey),
  ];
}
