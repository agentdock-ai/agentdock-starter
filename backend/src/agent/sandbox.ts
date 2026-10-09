import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_RUNTIME_MS = 10_000;

interface ScriptResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputLimited: boolean;
}

export class SandboxService {
  private resolvedRoot: string | undefined;
  private readonly configuredRoot: string;

  private constructor(configuredRoot: string) {
    this.configuredRoot = configuredRoot;
  }

  static async create(sandboxRoot: string): Promise<SandboxService> {
    const sandbox = new SandboxService(sandboxRoot);
    await sandbox.initialize();
    return sandbox;
  }

  async list(path = ".") {
    const directory = await this.resolveDirectory(path);
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

  async read(path: string) {
    const file = await this.resolveFile(path);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);

    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error("Only regular files can be read.");
      if (info.size > MAX_FILE_BYTES)
        throw new Error("Files are limited to 256 KB.");
      return await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  }

  async write(path: string, content: string) {
    if (typeof content !== "string")
      throw new Error("File content must be text.");
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new Error("Files are limited to 256 KB.");

    const file = await this.resolveFile(path, { createParents: true });
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
      return { path: relative(this.root, file), bytes };
    } finally {
      await handle.close();
    }
  }

  async delete(path: string) {
    const file = await this.resolveFile(path);
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error("Only regular files can be deleted.");

    await unlink(file);
    return { path: relative(this.root, file), deleted: true };
  }

  async run(path: string, signal?: AbortSignal) {
    if (typeof path !== "string" || !path.endsWith(".mjs"))
      throw new Error("Run only JavaScript module files ending in .mjs.");

    const root = this.root;
    const file = await this.resolveFile(path);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await handle.stat()).isFile())
        throw new Error("Only regular files can be run.");
    } finally {
      await handle.close();
    }

    if (signal?.aborted) throw abortError(signal);

    const result = await this.runScript(root, file, signal);
    return this.formatScriptResult(result);
  }

  private async initialize() {
    await mkdir(this.configuredRoot, { recursive: true });
    const info = await lstat(this.configuredRoot);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("Sandbox paths cannot use symlinks or non-directories.");

    this.resolvedRoot = await realpath(this.configuredRoot);
    await this.assertDirectory(this.root);
  }

  private async resolveDirectory(path: string) {
    const segments = this.pathSegments(path, { allowRoot: true });
    let current = this.root;

    for (const segment of segments) {
      current = resolve(current, segment);
      this.assertInsideSandbox(current);
      await this.assertDirectory(current);
    }

    return current;
  }

  private async resolveFile(
    path: string,
    { createParents = false }: { createParents?: boolean } = {},
  ) {
    const segments = this.pathSegments(path);
    const parentSegments = segments.slice(0, -1);
    let parent = this.root;

    for (const segment of parentSegments) {
      parent = resolve(parent, segment);
      this.assertInsideSandbox(parent);

      try {
        await this.assertDirectory(parent);
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

    this.assertInsideSandbox(parent);
    await this.assertDirectory(parent);
    const file = resolve(parent, segments.at(-1)!);
    this.assertInsideSandbox(file);
    return file;
  }

  private pathSegments(path: string, { allowRoot = false } = {}) {
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

  private async assertDirectory(path: string) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("Sandbox paths cannot use symlinks or non-directories.");

    const actual = await realpath(path);
    this.assertInsideSandbox(actual);
  }

  private assertInsideSandbox(path: string) {
    const pathFromRoot = relative(this.root, path);
    if (
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    )
      throw new Error("Access outside .sandbox is not allowed.");
  }

  private async runScript(
    root: string,
    file: string,
    signal?: AbortSignal,
  ): Promise<ScriptResult> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--permission",
          `--allow-fs-read=${root}`,
          `--allow-fs-write=${root}`,
          file,
        ],
        {
          cwd: root,
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
      }, MAX_RUNTIME_MS);

      const capture = (target: "stdout" | "stderr", chunk: Buffer) => {
        const remaining = MAX_OUTPUT_BYTES - outputBytes;
        outputBytes += chunk.byteLength;
        if (remaining > 0) {
          const value = chunk.subarray(0, remaining).toString("utf8");
          if (target === "stdout") stdout += value;
          else stderr += value;
        }
        if (outputBytes > MAX_OUTPUT_BYTES && !outputLimited) {
          outputLimited = true;
          child.kill("SIGKILL");
        }
      };

      const abortChild = () => {
        child.kill("SIGTERM");
        abortTimer = setTimeout(() => child.kill("SIGKILL"), 500);
      };
      const cleanup = () => {
        clearTimeout(timer);
        if (abortTimer) clearTimeout(abortTimer);
        signal?.removeEventListener("abort", abortChild);
      };

      signal?.addEventListener("abort", abortChild, { once: true });
      if (signal?.aborted) abortChild();

      child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
      child.once("error", (error) => {
        cleanup();
        reject(error);
      });
      child.once("close", (code, childSignal) => {
        cleanup();
        if (signal?.aborted) {
          reject(abortError(signal));
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
    });
  }

  private formatScriptResult(result: ScriptResult) {
    const lines = [`Exit code: ${result.exitCode ?? "terminated"}`];
    if (result.timedOut) lines.push("Stopped after the 10-second time limit.");
    if (result.outputLimited) lines.push("Output was limited to 64 KB.");
    if (result.stdout) lines.push(`stdout:\n${result.stdout.trimEnd()}`);
    if (result.stderr) lines.push(`stderr:\n${result.stderr.trimEnd()}`);
    return lines.join("\n");
  }

  private get root() {
    if (!this.resolvedRoot)
      throw new Error("Sandbox must be initialized before use.");
    return this.resolvedRoot;
  }
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("The operation was aborted.", "AbortError");
}
