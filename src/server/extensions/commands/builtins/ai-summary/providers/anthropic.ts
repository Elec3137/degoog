import { logger } from "../../../../../utils/logger";
import { resolveProviderBaseUrl } from "./base-url";
import { readSse } from "./sse";
import {
  ANTHROPIC_DEFAULT_BASE,
  ANTHROPIC_VERSION,
  ChatMessage,
  ChatRole,
  ChunkKind,
  ProviderAdapter,
  ProviderConfig,
  ProviderId,
  StreamChunk,
  StreamOptions,
} from "./types";

const LOG_NS = "ai-summary:anthropic";
const THINKING_BUDGET = 1024;

interface AnthropicDelta {
  type?: string;
  text?: string;
  thinking?: string;
  stop_reason?: string;
}

interface AnthropicStreamPayload {
  type?: string;
  delta?: AnthropicDelta;
  message?: { stop_reason?: string };
}

const toAnthropicMessages = (
  messages: ChatMessage[],
): { system: string; turns: { role: string; content: string }[] } => {
  let system = "";
  const turns: { role: string; content: string }[] = [];
  for (const m of messages) {
    if (m.role === ChatRole.System) {
      system += (system ? "\n\n" : "") + m.content;
      continue;
    }
    turns.push({
      role: m.role === ChatRole.Assistant ? "assistant" : "user",
      content: m.content,
    });
  }
  return { system, turns };
};

const callAnthropic = async (
  config: ProviderConfig,
  messages: ChatMessage[],
  opts: StreamOptions,
): Promise<Response> => {
  const base = resolveProviderBaseUrl(config.baseUrl ?? "", ANTHROPIC_DEFAULT_BASE);
  const { system, turns } = toAnthropicMessages(messages);
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: opts.maxTokens,
    stream: true,
    messages: turns,
  };
  if (system) body["system"] = system;
  if (opts.enableThinking) {
    body["thinking"] = { type: "enabled", budget_tokens: THINKING_BUDGET };
  }
  return fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
};

export const streamAnthropic = async function* (
  config: ProviderConfig,
  messages: ChatMessage[],
  opts: StreamOptions,
): AsyncIterable<StreamChunk> {
  let res: Response;
  try {
    res = await callAnthropic(config, messages, opts);
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
    let payload: AnthropicStreamPayload;
    try {
      payload = JSON.parse(ev.data) as AnthropicStreamPayload;
    } catch {
      continue;
    }
    if (payload.type === "content_block_delta" && payload.delta) {
      const d = payload.delta;
      if (d.type === "thinking_delta" && d.thinking) {
        yield { kind: ChunkKind.Thinking, text: d.thinking };
        continue;
      }
      if (d.type === "text_delta" && d.text) {
        yield { kind: ChunkKind.Text, text: d.text };
      }
    } else if (payload.type === "message_delta" && payload.delta?.stop_reason) {
      finishReason = payload.delta.stop_reason;
    } else if (payload.type === "message_stop") {
      break;
    }
  }
  yield { kind: ChunkKind.Done, finishReason };
};

export const anthropicAdapter: ProviderAdapter = {
  id: ProviderId.Anthropic,
  stream: streamAnthropic,
};
