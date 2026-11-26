/**
 * Web Worker for the regex tool. Runs matching off the main thread so a
 * pathological pattern can be killed (worker.terminate()) instead of
 * freezing the page. Logic lives in lib/regex.ts.
 */
import { computeMatches } from "../../lib/regex";

interface RegexRequest {
  id: number;
  pattern: string;
  flags: string;
  text: string;
}

const ctx = self as unknown as {
  addEventListener(type: "message", listener: (e: MessageEvent<RegexRequest>) => void): void;
  postMessage(message: unknown): void;
};

ctx.addEventListener("message", (e) => {
  const { id, pattern, flags, text } = e.data;
  ctx.postMessage({ id, result: computeMatches(pattern, flags, text) });
});
