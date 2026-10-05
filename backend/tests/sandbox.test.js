import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSandbox } from "../src/agent/sandbox.ts";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "agentdock-sandbox-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sandbox = createSandbox(join(root, "workspace"));
  await sandbox.initialize();
  return { root, sandbox };
}

test("sandbox reads, writes, lists and deletes only regular workspace files", async (t) => {
  const { sandbox } = await fixture(t);
  await sandbox.write("nested/file.txt", "hello");
  assert.equal(await sandbox.read("nested/file.txt"), "hello");
  assert.deepEqual(await sandbox.list(), [
    { name: "nested", type: "directory" },
  ]);
  assert.deepEqual(await sandbox.list("nested"), [
    { name: "file.txt", type: "file" },
  ]);
  await assert.rejects(sandbox.read("nested"), /regular files/);
  await assert.rejects(sandbox.delete("nested"), /regular file/);
  await sandbox.delete("nested/file.txt");
  assert.deepEqual(await sandbox.list("nested"), []);
});

test("sandbox rejects traversal, symlinks and files larger than the byte limit", async (t) => {
  const { root, sandbox } = await fixture(t);
  for (const path of [
    "../outside",
    "/tmp/outside",
    "a/../b",
    "a\\b",
    "bad\0name",
  ])
    await assert.rejects(sandbox.write(path, "text"));
  await symlink(root, join(root, "workspace/link"));
  await assert.rejects(sandbox.write("link/outside", "text"), /symlinks/);
  await assert.rejects(sandbox.read("link"));
  await assert.rejects(
    sandbox.write("large.txt", "😀".repeat(70_000)),
    /256 KB/,
  );
  assert.deepEqual(await sandbox.list(), []);
});

test(
  "sandbox runs modules and limits output and runtime",
  { timeout: 15000 },
  async (t) => {
    const { sandbox } = await fixture(t);
    await sandbox.write("check.mjs", 'console.log("passed")');
    assert.match(await sandbox.run("check.mjs"), /Exit code: 0[\s\S]*passed/);
    await assert.rejects(sandbox.run("check.js"), /\.mjs/);
    await sandbox.write(
      "flood.mjs",
      'process.stdout.write("x".repeat(100000))',
    );
    const output = await sandbox.run("flood.mjs");
    assert.match(output, /limited to 64 KB/);
    assert.ok(Buffer.byteLength(output) < 66_000);
    await sandbox.write("wait.mjs", "setInterval(() => {}, 1000)");
    assert.match(await sandbox.run("wait.mjs"), /10-second time limit/);
  },
);
