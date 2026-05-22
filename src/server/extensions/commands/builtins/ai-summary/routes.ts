import type { Hono } from "hono";
import { logger } from "../../../../utils/logger";
import type { ScoredResult } from "../../../../types";
import { _applyRateLimit } from "../../../../utils/search";
import {
  AISummarySettings,
  DEFAULT_SYSTEM_PROMPT,
  FOLLOWUP_MIN_TOKENS,
  buildSources,
  buildUserPrompt,
  getAISummarySettings,
  summaryCache,
  summaryCacheKey,
} from "./index";
import { pickAdapter } from "./providers";
import {
  ChatMessage,
  ChatRole,
  ChunkKind,
  StreamChunk,
} from "./providers/types";

const LOG_NS = "ai-summary:routes";
const ROUTE_SUMMARY = "/api/ai-summary/stream";
const ROUTE_CHAT = "/api/ai-chat/stream";
const THINK_ONLY_MS = 45_000;

const encoder = new TextEncoder();

const writeSse = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
): void => {
  const payload = typeof data === "string" ? data : JSON.stringify(data ?? {});
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
};

const sseResponse = (body: ReadableStream<Uint8Array>): Response =>
  new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });

interface PumpResult {
  finishReason?: string;
  errored: boolean;
  text: string;
}

const pump = async (
  iter: AsyncIterable<StreamChunk>,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<PumpResult> => {
  let errored = false;
  let finishReason: string | undefined;
  let text = "";
  for await (const ch of iter) {
    if (ch.kind === ChunkKind.Text) {
      text += ch.text;
      writeSse(controller, "delta", { text: ch.text });
    } else if (ch.kind === ChunkKind.Thinking) {
      writeSse(controller, "thinking", { text: ch.text });
    } else if (ch.kind === ChunkKind.Error) {
      errored = true;
      writeSse(controller, "error", { message: ch.message });
    } else if (ch.kind === ChunkKind.Done) {
      finishReason = ch.finishReason;
    }
  }
  return { finishReason, errored, text };
};

const runStream = (
  settings: AISummarySettings,
  messages: ChatMessage[],
  maxTokens: number,
  cacheKey: string | null,
): Response => {
  const adapter = pickAdapter(settings.provider);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), settings.timeoutMs);
  const emitThinking = settings.enableThinking;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      try {
        if (cacheKey) {
          const cached = await summaryCache.get(cacheKey);
          if (cached) {
            writeSse(controller, "delta", { text: cached });
            writeSse(controller, "done", { finishReason: "cache" });
            return;
          }
        }
        if (!emitThinking) {
          watchdog = setTimeout(() => {
            logger.warn(LOG_NS, "no text within window, aborting");
            abort.abort();
          }, THINK_ONLY_MS);
        }
        const iter = adapter.stream(
          {
            baseUrl: settings.baseUrl,
            model: settings.model,
            apiKey: settings.apiKey,
          },
          messages,
          {
            maxTokens,
            enableThinking: settings.enableThinking,
            signal: abort.signal,
          },
        );
        const wrapped = (async function* () {
          for await (const ch of iter) {
            if (ch.kind === ChunkKind.Text && watchdog) {
              clearTimeout(watchdog);
              watchdog = null;
            }
            yield ch;
          }
        })();
        const out = await pump(wrapped, controller);
        if (out.errored) return;
        if (!out.text.trim()) {
          writeSse(controller, "error", { message: "Model produced no answer" });
          return;
        }
        if (cacheKey) {
          try {
            await summaryCache.set(cacheKey, out.text);
          } catch (err) {
            logger.warn(LOG_NS, "cache set failed", err);
          }
        }
        writeSse(controller, "done", { finishReason: out.finishReason ?? "stop" });
      } catch (err) {
        logger.warn(LOG_NS, "stream failed", err);
        try {
          writeSse(controller, "error", { message: "Stream failed" });
        } catch { }
      } finally {
        if (watchdog) clearTimeout(watchdog);
        clearTimeout(timeout);
        try {
          controller.close();
        } catch { }
      }
    },
    cancel() {
      clearTimeout(timeout);
      abort.abort();
    },
  });
  return sseResponse(body);
};

const buildSummaryMsgs = (
  settings: AISummarySettings,
  query: string,
  results: ScoredResult[],
): ChatMessage[] => {
  const sources = buildSources(results);
  return [
    {
      role: ChatRole.System,
      content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    },
    { role: ChatRole.User, content: buildUserPrompt(query, sources) },
  ];
};

export const registerAiSummaryRoutes = (router: Hono): void => {
  router.post(ROUTE_SUMMARY, async (c) => {
    const limited = await _applyRateLimit(c);
    if (limited) return limited;
    let body: { query?: string; results?: ScoredResult[] };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const query = (body.query ?? "").trim();
    const results = Array.isArray(body.results) ? body.results : [];
    if (!query || results.length === 0) {
      return c.json({ error: "Missing query or results" }, 400);
    }
    const settings = await getAISummarySettings();
    if (!settings.model) {
      return c.json({ error: "AI summary not configured" }, 400);
    }
    const messages = buildSummaryMsgs(settings, query, results);
    const cacheKey = summaryCacheKey(query, results);
    return runStream(settings, messages, settings.maxTokens, cacheKey);
  });

  router.post(ROUTE_CHAT, async (c) => {
    const limited = await _applyRateLimit(c);
    if (limited) return limited;
    let body: { messages?: ChatMessage[] };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: "Missing messages" }, 400);
    }
    const settings = await getAISummarySettings();
    if (!settings.model) {
      return c.json({ error: "AI summary not configured" }, 400);
    }
    const followupTokens = Math.max(settings.maxTokens, FOLLOWUP_MIN_TOKENS);
    return runStream(settings, body.messages, followupTokens, null);
  });
};
