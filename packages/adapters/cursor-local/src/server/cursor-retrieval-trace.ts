import fs from "node:fs/promises";
import path from "node:path";

/** Matches stderr from Cursor agent: `cursor-retrieval: tracing to '/tmp/cursor_retrieval....log'` */
const TRACE_SINGLE_QUOTED_RE = /cursor-retrieval:\s*tracing to\s+'([^']+)'/gi;
const TRACE_DOUBLE_QUOTED_RE = /cursor-retrieval:\s*tracing to\s+"([^"]+)"/gi;

export function extractCursorRetrievalTracePaths(text: string): string[] {
  const out: string[] = [];
  for (const re of [TRACE_SINGLE_QUOTED_RE, TRACE_DOUBLE_QUOTED_RE]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const p = m[1]?.trim();
      if (p) out.push(p);
    }
  }
  return [...new Set(out)];
}

export type CursorRetrievalTraceInit = {
  runId: string;
};

export type CursorRetrievalTraceFailure = {
  runId: string;
  stage: string;
  error: string;
  hints: string[];
  exitCode: number | null;
  timedOut: boolean;
};

/**
 * Ensures the Cursor retrieval trace file is non-empty as soon as we learn its path.
 * Cursor may create a zero-byte file and crash before writing; operators rely on this file for forensics.
 */
export async function seedCursorRetrievalTraceLogIfEmpty(
  filePath: string,
  init: CursorRetrievalTraceInit,
): Promise<void> {
  const abs = path.resolve(filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true }).catch(() => undefined);

  const handle = await fs.open(abs, "a+");
  try {
    let size = 0;
    try {
      size = (await handle.stat()).size;
    } catch {
      size = 0;
    }
    if (size > 0) return;

    const record = {
      ok: true as const,
      stage: "init",
      source: "paperclip_adapter_cursor_local",
      runId: init.runId,
      tracePath: abs,
      message:
        "Seeded non-empty cursor-retrieval trace log; Cursor runtime had not written yet (or left file empty).",
      hints: [
        "Subsequent lines may be written by Cursor retrieval or by Paperclip on failure.",
        "If this is the only line, the agent process likely exited before emitting retrieval events.",
      ],
    };
    await handle.write(`${JSON.stringify(record)}\n`, 0, "utf8");
  } finally {
    await handle.close();
  }
}

export async function appendCursorRetrievalTraceFailure(
  filePath: string,
  failure: CursorRetrievalTraceFailure,
): Promise<void> {
  const abs = path.resolve(filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true }).catch(() => undefined);

  const record = {
    ok: false as const,
    stage: failure.stage,
    error: failure.error,
    hints: failure.hints,
    runId: failure.runId,
    exitCode: failure.exitCode,
    timedOut: failure.timedOut,
    tracePath: abs,
  };
  await fs.appendFile(abs, `${JSON.stringify(record)}\n`, "utf8");
}