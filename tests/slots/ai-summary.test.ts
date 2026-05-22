import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const _testDataDir = mkdtempSync(join(tmpdir(), "degoog-ai-summary-test-"));
process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(_testDataDir, "plugin-settings.json");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(_testDataDir, "server-settings.json");

import {
  setSettings,
  removeSettings,
} from "../../src/server/utils/plugin-settings";
import {
  AI_SUMMARY_ID,
  buildSources,
  buildUserPrompt,
  getAISummarySettings,
  summaryCacheKey,
} from "../../src/server/extensions/commands/builtins/ai-summary/index";
import {
  getSlotPluginById,
  initSlotPlugins,
} from "../../src/server/extensions/slots/registry";
import { streamOpenAI } from "../../src/server/extensions/commands/builtins/ai-summary/providers/openai";
import { streamGemini } from "../../src/server/extensions/commands/builtins/ai-summary/providers/gemini";
import { streamAnthropic } from "../../src/server/extensions/commands/builtins/ai-summary/providers/anthropic";
import {
  ChatRole,
  ChunkKind,
  ProviderId,
  type StreamChunk,
} from "../../src/server/extensions/commands/builtins/ai-summary/providers/types";

const sseResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
};

const collect = async (
  iter: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> => {
  const out: StreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
};

describe("ai-summary questionMarkOnly setting", () => {
  const origFetch = globalThis.fetch;

  beforeAll(async () => {
    globalThis.fetch = async () => new Response("", { status: 404 });

    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-ai-test-dir";
    await initSlotPlugins();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
  });

  afterAll(async () => {
    globalThis.fetch = origFetch;
    await removeSettings(AI_SUMMARY_ID);
  });

  test("getAISummarySettings returns questionMarkOnly from settings", async () => {
    await setSettings(AI_SUMMARY_ID, {
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      questionMarkOnly: true,
    });
    const settings = await getAISummarySettings();
    expect(settings.questionMarkOnly).toBe(true);
  });

  test("getAISummarySettings defaults questionMarkOnly to false", async () => {
    await removeSettings(AI_SUMMARY_ID);
    await setSettings(AI_SUMMARY_ID, {
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
    });
    const settings = await getAISummarySettings();
    expect(settings.questionMarkOnly).toBe(false);
  });

  test("trigger returns true for any query when questionMarkOnly is false", async () => {
    await setSettings(AI_SUMMARY_ID, {
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      questionMarkOnly: false,
    });
    const slot = getSlotPluginById("ai-summary-slot");
    expect(slot).not.toBeNull();
    expect(await slot!.trigger("best restaurants")).toBe(true);
    expect(await slot!.trigger("best restaurants?")).toBe(true);
  });

  test("trigger returns false for non-question when questionMarkOnly is true", async () => {
    await setSettings(AI_SUMMARY_ID, {
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      questionMarkOnly: true,
    });
    const slot = getSlotPluginById("ai-summary-slot");
    expect(slot).not.toBeNull();
    expect(await slot!.trigger("best restaurants")).toBe(false);
    expect(await slot!.trigger("  best restaurants  ")).toBe(false);
  });

  test("trigger returns true for question query when questionMarkOnly is true", async () => {
    await setSettings(AI_SUMMARY_ID, {
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      questionMarkOnly: true,
    });
    const slot = getSlotPluginById("ai-summary-slot");
    expect(slot).not.toBeNull();
    expect(await slot!.trigger("what are the best restaurants?")).toBe(true);
    expect(await slot!.trigger("why?")).toBe(true);
  });

  test("trigger returns false when baseUrl or model is not configured", async () => {
    await setSettings(AI_SUMMARY_ID, {
      baseUrl: "",
      model: "",
      questionMarkOnly: false,
    });
    const slot = getSlotPluginById("ai-summary-slot");
    expect(slot).not.toBeNull();
    expect(await slot!.trigger("test?")).toBe(false);
  });
});

describe("ai-summary new settings (provider, enableThinking)", () => {
  afterEach(async () => {
    await removeSettings(AI_SUMMARY_ID);
  });

  test("provider defaults to OpenAICompat when unset or unknown", async () => {
    await setSettings(AI_SUMMARY_ID, { model: "x", baseUrl: "y" });
    let s = await getAISummarySettings();
    expect(s.provider).toBe(ProviderId.OpenAICompat);
    await setSettings(AI_SUMMARY_ID, { model: "x", baseUrl: "y", provider: "nonsense" });
    s = await getAISummarySettings();
    expect(s.provider).toBe(ProviderId.OpenAICompat);
  });

  test("provider can be set to gemini or anthropic", async () => {
    await setSettings(AI_SUMMARY_ID, {
      model: "x",
      apiKey: "k",
      provider: ProviderId.Gemini,
    });
    let s = await getAISummarySettings();
    expect(s.provider).toBe(ProviderId.Gemini);
    await setSettings(AI_SUMMARY_ID, {
      model: "x",
      apiKey: "k",
      provider: ProviderId.Anthropic,
    });
    s = await getAISummarySettings();
    expect(s.provider).toBe(ProviderId.Anthropic);
  });

  test("enableThinking defaults to false", async () => {
    await setSettings(AI_SUMMARY_ID, { model: "x", baseUrl: "y" });
    const s = await getAISummarySettings();
    expect(s.enableThinking).toBe(false);
  });

  test("trigger requires apiKey for Gemini/Anthropic but not for OpenAICompat with Ollama", async () => {
    await setSettings(AI_SUMMARY_ID, {
      model: "llama3",
      baseUrl: "http://localhost:11434/v1",
      provider: ProviderId.OpenAICompat,
    });
    const slot = getSlotPluginById("ai-summary-slot");
    expect(await slot!.trigger("anything")).toBe(true);

    await setSettings(AI_SUMMARY_ID, {
      model: "gemini-2.0-flash",
      provider: ProviderId.Gemini,
      apiKey: "",
    });
    expect(await slot!.trigger("anything")).toBe(false);

    await setSettings(AI_SUMMARY_ID, {
      model: "gemini-2.0-flash",
      provider: ProviderId.Gemini,
      apiKey: "key",
    });
    expect(await slot!.trigger("anything")).toBe(true);
  });
});

describe("ai-summary prompt helpers", () => {
  test("buildSources caps at 6 and computes hostnames", () => {
    const results = Array.from({ length: 9 }).map((_, i) => ({
      title: `T${i}`,
      url: `https://www.example${i}.com/x`,
      snippet: `S${i}`,
      score: 1,
      engineRank: 1,
      engines: [],
    }));
    const sources = buildSources(results as never);
    expect(sources.length).toBe(6);
    expect(sources[0].index).toBe(1);
    expect(sources[0].host).toBe("example0.com");
  });

  test("buildUserPrompt formats numbered block with hostnames", () => {
    const sources = buildSources([
      {
        title: "Foo",
        url: "https://foo.com",
        snippet: "Bar",
        score: 1,
        engineRank: 1,
        engines: [],
      },
    ] as never);
    const out = buildUserPrompt("hello?", sources);
    expect(out).toContain("Query: hello?");
    expect(out).toContain("[1] Foo (foo.com)");
    expect(out).toContain("Bar");
  });

  test("summaryCacheKey is stable for same inputs", () => {
    const a = summaryCacheKey("Q", [{ url: "u", snippet: "s" }]);
    const b = summaryCacheKey("q", [{ url: "u", snippet: "s" }]);
    expect(a).toBe(b);
  });

  test("summaryCacheKey changes when snippets change", () => {
    const a = summaryCacheKey("q", [{ url: "u", snippet: "s1" }]);
    const b = summaryCacheKey("q", [{ url: "u", snippet: "s2" }]);
    expect(a).not.toBe(b);
  });
});

describe("ai-summary OpenAI streaming adapter", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("yields text deltas and a done chunk", async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ])) as typeof fetch;

    const chunks = await collect(
      streamOpenAI(
        { baseUrl: "http://x", model: "m", apiKey: "" },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: false },
      ),
    );
    const texts = chunks
      .filter((c) => c.kind === ChunkKind.Text)
      .map((c) => (c as { kind: ChunkKind.Text; text: string }).text);
    expect(texts.join("")).toBe("Hello world");
    expect(chunks[chunks.length - 1].kind).toBe(ChunkKind.Done);
  });

  test("streams reasoning_content as Thinking chunks before text", async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"more"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        "data: [DONE]\n\n",
      ])) as typeof fetch;
    const chunks = await collect(
      streamOpenAI(
        { baseUrl: "http://x", model: "m", apiKey: "" },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: true },
      ),
    );
    const thinking = chunks
      .filter((c) => c.kind === ChunkKind.Thinking)
      .map((c) => (c as { kind: ChunkKind.Thinking; text: string }).text)
      .join("");
    expect(thinking).toBe("thinking...more");
    const text = chunks
      .filter((c) => c.kind === ChunkKind.Text)
      .map((c) => (c as { kind: ChunkKind.Text; text: string }).text)
      .join("");
    expect(text).toBe("Hi");
  });

  test("yields error chunk on non-OK response", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as typeof fetch;
    const chunks = await collect(
      streamOpenAI(
        { baseUrl: "http://x", model: "m", apiKey: "" },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: false },
      ),
    );
    expect(chunks.some((c) => c.kind === ChunkKind.Error)).toBe(true);
  });
});

describe("ai-summary Gemini streaming adapter", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("parses parts with text and surfaces thoughts as Thinking", async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"thinking","thought":true}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"world"}],"role":"model"},"finishReason":"STOP"}]}\n\n',
      ])) as typeof fetch;
    const chunks = await collect(
      streamGemini(
        { baseUrl: "", model: "gemini-2.0-flash", apiKey: "k" },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: true },
      ),
    );
    const texts = chunks
      .filter((c) => c.kind === ChunkKind.Text)
      .map((c) => (c as { kind: ChunkKind.Text; text: string }).text)
      .join("");
    expect(texts).toBe("Hello world");
    expect(chunks.some((c) => c.kind === ChunkKind.Thinking)).toBe(true);
    expect(chunks[chunks.length - 1].kind).toBe(ChunkKind.Done);
  });

  test("passes thinkingBudget=0 when enableThinking is false", async () => {
    let captured: string | undefined;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      captured = init.body as string;
      return sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
      ]);
    }) as typeof fetch;
    await collect(
      streamGemini(
        { baseUrl: "", model: "gemini-2.5-flash", apiKey: "k" },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: false },
      ),
    );
    expect(captured).toBeDefined();
    expect(JSON.parse(captured!).generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 0,
    });
  });
});

describe("ai-summary Anthropic streaming adapter", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("parses content_block_delta text and surfaces thinking_delta as Thinking", async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        'event: message_start\ndata: {"type":"message_start"}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])) as typeof fetch;
    const chunks = await collect(
      streamAnthropic(
        { baseUrl: "", model: "claude-haiku-4-5", apiKey: "k" },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: true },
      ),
    );
    const text = chunks
      .filter((c) => c.kind === ChunkKind.Text)
      .map((c) => (c as { kind: ChunkKind.Text; text: string }).text)
      .join("");
    expect(text).toBe("Hello world");
    expect(chunks.filter((c) => c.kind === ChunkKind.Thinking).length).toBe(1);
    expect(chunks[chunks.length - 1].kind).toBe(ChunkKind.Done);
  });

  test("sends x-api-key and anthropic-version headers", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return sseResponse([
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    }) as typeof fetch;
    await collect(
      streamAnthropic(
        { baseUrl: "", model: "claude-haiku-4-5", apiKey: "secret" },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: false },
      ),
    );
    expect(capturedHeaders["x-api-key"]).toBe("secret");
    expect(capturedHeaders["anthropic-version"]).toBeDefined();
  });
});

describe("ai-summary base URL normalization", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("Gemini host-only baseUrl is normalised to include /v1beta", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
      ]);
    }) as typeof fetch;
    await collect(
      streamGemini(
        {
          baseUrl: "https://generativelanguage.googleapis.com",
          model: "gemini-2.5-flash",
          apiKey: "k",
        },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: false },
      ),
    );
    expect(capturedUrl).toContain(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent",
    );
  });

  test("Anthropic host-only baseUrl is normalised to include /v1", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return sseResponse([
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    }) as typeof fetch;
    await collect(
      streamAnthropic(
        {
          baseUrl: "https://api.anthropic.com",
          model: "claude-haiku-4-5",
          apiKey: "k",
        },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: false },
      ),
    );
    expect(capturedUrl).toBe("https://api.anthropic.com/v1/messages");
  });

  test("user-provided baseUrl with a path is left intact", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return sseResponse([
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    }) as typeof fetch;
    await collect(
      streamAnthropic(
        {
          baseUrl: "https://my-proxy.example.com/anthropic",
          model: "claude-haiku-4-5",
          apiKey: "k",
        },
        [{ role: ChatRole.User, content: "hi" }],
        { maxTokens: 64, enableThinking: false },
      ),
    );
    expect(capturedUrl).toBe(
      "https://my-proxy.example.com/anthropic/messages",
    );
  });
});

afterAll(() => {
  try {
    rmSync(_testDataDir, { recursive: true, force: true });
  } catch { }
});
