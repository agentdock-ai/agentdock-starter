import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SandboxService } from "../src/agent/sandbox.ts";

test("aborting an approved script waits for process exit and prevents later writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentdock-script-abort-"));
  const sandbox = await SandboxService.create(root);
  const controller = new AbortController();
  try {
    await writeFile(
      join(root, "slow.mjs"),
      [
        'import { writeFile } from "node:fs/promises";',
        'await writeFile("started.txt", "ready");',
        "await new Promise((resolve) => setTimeout(resolve, 400));",
        'await writeFile("late.txt", "should not happen");',
      ].join("\n"),
    );
    const running = sandbox.run("slow.mjs", controller.signal);
    await waitForFile(join(root, "started.txt"));
    controller.abort();
    await assert.rejects(running, { name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 450));
    await assert.rejects(access(join(root, "late.txt")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function waitForFile(path) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("The script did not start before the test deadline.");
}
