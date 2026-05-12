import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendCursorRetrievalTraceFailure,
  extractCursorRetrievalTracePaths,
  seedCursorRetrievalTraceLogIfEmpty,
} from "./cursor-retrieval-trace.js";

describe("cursor-retrieval trace helpers", () => {
  it("extracts trace paths from stderr-shaped text", () => {
    const line = "cursor-retrieval: tracing to '/var/tmp/cursor_retrieval.1.2.log'\n";
    expect(extractCursorRetrievalTracePaths(line)).toEqual(["/var/tmp/cursor_retrieval.1.2.log"]);
    expect(extractCursorRetrievalTracePaths(`x ${line} y`)).toEqual(["/var/tmp/cursor_retrieval.1.2.log"]);
    expect(extractCursorRetrievalTracePaths('cursor-retrieval: tracing to "/tmp/a.log"')).toEqual(["/tmp/a.log"]);
  });

  it("seeds an empty file with a JSON init line", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pc-cursor-retrieval-"));
    const logPath = path.join(dir, "cursor_retrieval.test.log");
    await fs.writeFile(logPath, "", "utf8");
    await seedCursorRetrievalTraceLogIfEmpty(logPath, { runId: "run-1" });
    const body = await fs.readFile(logPath, "utf8");
    const line = body.trim().split("\n")[0] ?? "";
    const rec = JSON.parse(line) as { ok: boolean; stage: string; runId: string };
    expect(rec.ok).toBe(true);
    expect(rec.stage).toBe("init");
    expect(rec.runId).toBe("run-1");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("does not overwrite a non-empty trace file on seed", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pc-cursor-retrieval-"));
    const logPath = path.join(dir, "cursor_retrieval.test.log");
    await fs.writeFile(logPath, "cursor-owned\n", "utf8");
    await seedCursorRetrievalTraceLogIfEmpty(logPath, { runId: "run-2" });
    const body = await fs.readFile(logPath, "utf8");
    expect(body.trim()).toBe("cursor-owned");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("appends a failure envelope", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pc-cursor-retrieval-"));
    const logPath = path.join(dir, "cursor_retrieval.test.log");
    await seedCursorRetrievalTraceLogIfEmpty(logPath, { runId: "run-3" });
    await appendCursorRetrievalTraceFailure(logPath, {
      runId: "run-3",
      stage: "process_exit",
      error: "boom",
      hints: ["h1"],
      exitCode: 1,
      timedOut: false,
    });
    const lines = (await fs.readFile(logPath, "utf8")).trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const last = JSON.parse(lines[lines.length - 1] ?? "{}") as { ok: boolean; stage: string; error: string };
    expect(last.ok).toBe(false);
    expect(last.stage).toBe("process_exit");
    expect(last.error).toBe("boom");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
