import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  unlink,
  open,
  readdir,
  realpath,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const maxFileBytes = 256 * 1024;
const maxOutputBytes = 64 * 1024;
const maxRuntimeMs = 10_000;

export function createSandbox(sandboxRoot: string) {
  async function initializeSandbox() {
    await mkdir(sandboxRoot, { recursive: true });
    const info = await lstat(sandboxRoot);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("Sandbox paths cannot use symlinks or non-directories.");
    sandboxRoot = await realpath(sandboxRoot);
    await assertDirectory(sandboxRoot);
  }

  async function listSandboxFiles(path: string = ".") {
    const directory = await resolveDirectory(path);
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => !entry.isSymbolicLink())
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory()
          ? "directory"
          : entry.isFile()
            ? "file"
            : "other",
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 200);
  }

  async function readSandboxFile(path: string) {
    const file = await resolveFile(path);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error("Only regular files can be read.");
      if (info.size > maxFileBytes)
        throw new Error("Files are limited to 256 KB.");
      return await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  }

  async function writeSandboxFile(path: string, content: string) {
    if (typeof content !== "string")
      throw new Error("File content must be text.");
    if (Buffer.byteLength(content, "utf8") > maxFileBytes)
      throw new Error("Files are limited to 256 KB.");

    const file = await resolveFile(path, { createParents: true });
    const handle = await open(
      file,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_TRUNC |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error("Only regular files can be written.");
      await handle.writeFile(content, "utf8");
      return {
        path: relative(sandboxRoot, file),
        bytes: Buffer.byteLength(content, "utf8"),
      };
    } finally {
      await handle.close();
    }
  }

  async function deleteSandboxFile(path: string) {
    const file = await resolveFile(path);
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error("Only regular files can be deleted.");
    await unlink(file);
    return { path: relative(sandboxRoot, file), deleted: true };
  }

  async function runSandboxScript(path: string, runSignal?: AbortSignal) {
    if (typeof path !== "string" || !path.endsWith(".mjs"))
      throw new Error("Run only JavaScript module files ending in .mjs.");
    const file = await resolveFile(path);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await handle.stat()).isFile())
        throw new Error("Only regular files can be run.");
    } finally {
      await handle.close();
    }

    if (runSignal?.aborted) throw abortError(runSignal);

    return new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      outputLimited: boolean;
    }>((resolvePromise, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--permission",
          `--allow-fs-read=${sandboxRoot}`,
          `--allow-fs-write=${sandboxRoot}`,
          file,
        ],
        {
          cwd: sandboxRoot,
          env: { PATH: process.env.PATH ?? "" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let timedOut = false;
      let outputLimited = false;
      let abortTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, maxRuntimeMs);

      function capture(target: "stdout" | "stderr", chunk: Buffer) {
        const remaining = maxOutputBytes - outputBytes;
        outputBytes += chunk.byteLength;
        if (remaining > 0) {
          const value = chunk.subarray(0, remaining).toString("utf8");
          if (target === "stdout") stdout += value;
          else stderr += value;
        }
        if (outputBytes > maxOutputBytes && !outputLimited) {
          outputLimited = true;
          child.kill("SIGKILL");
        }
      }

      function abortChild() {
        child.kill("SIGTERM");
        abortTimer = setTimeout(() => child.kill("SIGKILL"), 500);
      }

      runSignal?.addEventListener("abort", abortChild, { once: true });
      if (runSignal?.aborted) abortChild();

      child.stdout.on("data", (chunk) => capture("stdout", chunk));
      child.stderr.on("data", (chunk) => capture("stderr", chunk));
      child.once("error", (error) => {
        clearTimeout(timer);
        if (abortTimer) clearTimeout(abortTimer);
        runSignal?.removeEventListener("abort", abortChild);
        reject(error);
      });
      child.once("close", (code, childSignal) => {
        clearTimeout(timer);
        if (abortTimer) clearTimeout(abortTimer);
        runSignal?.removeEventListener("abort", abortChild);
        if (runSignal?.aborted) {
          reject(abortError(runSignal));
          return;
        }
        resolvePromise({
          exitCode: code,
          signal: childSignal,
          stdout,
          stderr,
          timedOut,
          outputLimited,
        });
      });
    }).then((result) => {
      const lines = [`Exit code: ${result.exitCode ?? "terminated"}`];
      if (result.timedOut)
        lines.push("Stopped after the 10-second time limit.");
      if (result.outputLimited) lines.push("Output was limited to 64 KB.");
      if (result.stdout) lines.push(`stdout:\n${result.stdout.trimEnd()}`);
      if (result.stderr) lines.push(`stderr:\n${result.stderr.trimEnd()}`);
      return lines.join("\n");
    });
  }

  async function resolveDirectory(path: string) {
    const segments = pathSegments(path, { allowRoot: true });
    let current = sandboxRoot;
    for (const segment of segments) {
      current = resolve(current, segment);
      assertInsideSandbox(current);
      await assertDirectory(current);
    }
    return current;
  }

  async function resolveFile(path: string, { createParents = false } = {}) {
    const segments = pathSegments(path);
    const parentSegments = segments.slice(0, -1);
    let parent = sandboxRoot;
    for (const segment of parentSegments) {
      parent = resolve(parent, segment);
      assertInsideSandbox(parent);
      try {
        await assertDirectory(parent);
      } catch (error) {
        if (
          !createParents ||
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
        await mkdir(parent);
      }
    }
    assertInsideSandbox(parent);
    await assertDirectory(parent);
    const file = resolve(parent, segments.at(-1)!);
    assertInsideSandbox(file);
    return file;
  }

  function pathSegments(path: string, { allowRoot = false } = {}) {
    if (
      typeof path !== "string" ||
      !path ||
      path.includes("\0") ||
      path.includes("\\") ||
      isAbsolute(path)
    )
      throw new Error("Use a relative path inside .sandbox.");
    if (allowRoot && path === ".") return [];
    const segments = path.split("/").filter(Boolean);
    if (
      !segments.length ||
      segments.some((segment) => [".", ".."].includes(segment))
    )
      throw new Error("Path traversal is not allowed.");
    return segments;
  }

  async function assertDirectory(path: string) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("Sandbox paths cannot use symlinks or non-directories.");
    const actual = await realpath(path);
    assertInsideSandbox(actual);
  }

  function assertInsideSandbox(path: string) {
    const pathFromRoot = relative(sandboxRoot, path);
    if (
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    )
      throw new Error("Access outside .sandbox is not allowed.");
  }

  return {
    initialize: initializeSandbox,
    list: listSandboxFiles,
    read: readSandboxFile,
    write: writeSandboxFile,
    delete: deleteSandboxFile,
    run: runSandboxScript,
  };
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("The operation was aborted.", "AbortError");
}
