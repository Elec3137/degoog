import { logger } from "../../../../../utils/logger";
import { resolveProviderBaseUrl } from "./base-url";
import { readSse } from "./sse";
import {
  ChatMessage,
  ChatRole,
  ChunkKind,
  GEMINI_DEFAULT_BASE,
  ProviderAdapter,
  ProviderConfig,
  ProviderId,
  StreamChunk,
  StreamOptions,
} from "./types";

const LOG_NS = "ai-summary:gemini";

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[]; role?: string };
  finishReason?: string;
}

interface GeminiStreamPayload {
  candidates?: GeminiCandidate[];
}

const toGeminiContents = (
  messages: ChatMessage[],
): { contents: { role: string; parts: { text: string }[] }[]; system: string } => {
  const contents: { role: string; parts: { text: string }[] }[] = [];
  let system = "";
  for (const m of messages) {
    if (m.role === ChatRole.System) {
      system += (system ? "\n\n" : "") + m.content;
      continue;
    }
    contents.push({
      role: m.role === ChatRole.Assistant ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return { contents, system };
};

const callGemini = async (
  config: ProviderConfig,
  messages: ChatMessage[],
  opts: StreamOptions,
): Promise<Response> => {
  const base = resolveProviderBaseUrl(config.baseUrl ?? "", GEMINI_DEFAULT_BASE);
  const url = `${base}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
  const { contents, system } = toGeminiContents(messages);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
      thinkingConfig: opts.enableThinking
        ? { includeThoughts: true }
        : { thinkingBudget: 0 },
    },
  };
  if (system) body["systemInstruction"] = { parts: [{ text: system }] };
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
};

export const streamGemini = async function* (
  config: ProviderConfig,
  messages: ChatMessage[],
  opts: StreamOptions,
): AsyncIterable<StreamChunk> {
  let res: Response;
  try {
    res = await callGemini(config, messages, opts);
  } catch (err) {
    logger.warn(LOG_NS, "request failed", err);
    yield { kind: ChunkKind.Error, message: "AI request failed" };
    return;
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    logger.warn(LOG_NS, `bad response ${res.status}`, text.slice(0, 200));
    yield {
      kind: ChunkKind.Error,
      message: `Provider returned ${res.status}`,
    };
    return;
  }
  let finishReason: string | undefined;
  for await (const ev of readSse(res.body)) {
    let payload: GeminiStreamPayload;
    try {
      payload = JSON.parse(ev.data) as GeminiStreamPayload;
    } catch {
      continue;
    }
    const cand = payload.candidates?.[0];
    if (!cand) continue;
    for (const part of cand.content?.parts ?? []) {
      if (!part.text) continue;
      if (part.thought) {
        yield { kind: ChunkKind.Thinking, text: part.text };
      } else {
        yield { kind: ChunkKind.Text, text: part.text };
      }
    }
    if (cand.finishReason) finishReason = cand.finishReason;
  }
  yield { kind: ChunkKind.Done, finishReason };
};

export const geminiAdapter: ProviderAdapter = {
  id: ProviderId.Gemini,
  stream: streamGemini,
};
