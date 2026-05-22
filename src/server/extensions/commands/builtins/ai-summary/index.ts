import { createHash } from "node:crypto";
import {
  SlotPanelPosition,
  TranslateFunction,
  type ScoredResult,
  type SettingField,
  type SlotPlugin,
} from "../../../../types";
import {
  useCache,
  SHORT_TTL_MS,
  type AsyncTtlCache,
} from "../../../../utils/cache";
import { asBoolean, asString, getSettings } from "../../../../utils/plugin-settings";
import { ProviderId } from "./providers";

export const AI_SUMMARY_ID = "ai-summary-slot";
export const SUMMARY_NAMESPACE = "ext:ai-summary:summary";
export const MAX_SOURCES = 6;
export const DEFAULT_TIMEOUT_S = 180;
export const DEFAULT_MAX_TOKENS = 2048;
export const FOLLOWUP_MIN_TOKENS = 512;

export const DEFAULT_SYSTEM_PROMPT = [
  "<identity>",
  "You are a Search Synthesis Engine. Your sole purpose is to deliver an accurate, useful, highly structured, and deeply cited answer to the user's query, drawing strictly from the numbered search results provided.",
  "</identity>",
  "",
  "<context_integration>",
  "Context arrives as numbered results: [N] Title (host)\\nSnippet.",
  "Your answer must be entirely informed by that context. If the context does not fully answer the query, state plainly what is missing, summarize what is available, and suggest one or two follow-up searches the user could try. Do not assume or extrapolate.",
  "Never refer to your training cutoff, your model architecture, or your lack of real-time access. The provided context IS your real-time access.",
  "</context_integration>",
  "",
  "<citation_protocol>",
  "1. CRITICAL: Every single factual claim, statement, list item, or table row MUST be cited inline as [N] immediately after the claim, with no space between the last word and the bracket.",
  "2. Multiple sources on one claim look like [1][3]. If several results corroborate a claim, cite all of them.",
  "3. Cite only results you actually used. Do not invent citations or pad with irrelevant ones.",
  "4. Never include a References, Sources, or Bibliography section. Never write URLs or full source titles in the prose. The engine renders the [N] markers as links.",
  "</citation_protocol>",
  "",
  "<formatting_and_ux>",
  "- STRUCTURED & CITED: Scale the depth of the answer to match the complexity of the query. For factual lookups, a single cited sentence is fine. For multi-faceted queries, provide a comprehensive, multi-paragraph layout using headers, lists, or tables, but EVERY section, list item, or table cell containing factual data must carry its respective [N] citation.",
  "- SCANNABILITY IS KING: Break up dense walls of text. Use Level-2 headers (##) to separate distinct aspects of the answer. Use **bolding** for critical terms, dates, and names to guide the user's eye.",
  "- LISTS & TABLES: Whenever comparing data, listing steps, or aggregating distinct points, aggressively prefer structured Markdown lists (bulleted or numbered) or Markdown tables over prose paragraphs. Ensure inline citations [N] are embedded within these lists/tables.",
  "- Begin directly with the answer (or a one-sentence high-level overview for multi-part queries). Never start with a markdown heading, a preamble, or filler like 'Sure', 'Here is', 'Based on the search results', or 'According to the sources'.",
  "- Match the language of the user's query.",
  "- If code is required, emit the fully functional code block first, then a short explanation beneath.",
  "</formatting_and_ux>",
  "",
  "<tone_and_guardrails>",
  "- Unbiased, journalistic, authoritative. Avoid opinionated adjectives.",
  "- No hedging or moralizing. Cut phrases like 'It is important to', 'It is worth noting', 'It is subjective', 'Some might argue', 'it seems', 'it might be', unless the sources themselves disagree, in which case briefly note the disagreement and prefer the most recent or most authoritative-looking source.",
  "- Copyright: do not reproduce long verbatim passages (lyrics, poems, full articles, full recipes). Summarize and rewrite in your own words.",
  "</tone_and_guardrails>",
  "",
  "<execution_workflow>",
  "CRITICAL FOR SPEED: Do not deliberate, plan, or analyze. Do not generate a hidden reasoning chain or draft. Treat this as a direct stream-to-output task. Read the context and immediately begin writing the final synthesized answer in a single pass, adhering strictly to the formatting and inline citation rules above.",
  "</execution_workflow>",
].join("\n");

export const aiSummarySettingsSchema: SettingField[] = [
  {
    key: "questionMarkOnly",
    label: "Only trigger on questions (?)",
    type: "toggle",
    description: "Only show summaries when the query ends with `?`.",
  },
  {
    key: "provider",
    label: "Provider",
    type: "select",
    options: [ProviderId.OpenAICompat, ProviderId.Gemini, ProviderId.Anthropic],
    optionLabels: [
      "OpenAI compatible (OpenAI, Ollama, vLLM, ...)",
      "Google Gemini (native)",
      "Anthropic Claude (native)",
    ],
    default: ProviderId.OpenAICompat,
    description:
      "**OpenAI-compatible** covers OpenAI, [Ollama](https://ollama.com), vLLM. **Gemini** and **Anthropic** use their native streaming APIs.",
  },
  {
    key: "baseUrl",
    label: "API Base URL",
    type: "url",
    placeholder: "https://api.openai.com/v1",
    description:
      "Include the version path for OpenAI-compatible providers (`https://api.openai.com/v1`, or `http://localhost:11434/v1` for [Ollama](https://ollama.com)). Leave blank for Gemini and Anthropic; if you set a host-only override, the version path is filled in automatically.",
  },
  {
    key: "model",
    label: "Model",
    type: "text",
    required: true,
    placeholder: "gpt-4o-mini / gemini-2.5-flash / claude-haiku-4-5",
    description:
      "Model id. Lists: [OpenAI](https://platform.openai.com/docs/models), [Gemini](https://ai.google.dev/gemini-api/docs/models), [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models). For Ollama/vLLM use whatever you have served. Reasoning models work; their thoughts stream live and clear when the answer starts.",
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    secret: true,
    placeholder: "Leave blank for local models (Ollama)",
    description:
      "Get one from [OpenAI](https://platform.openai.com/api-keys), [Google AI Studio](https://aistudio.google.com/apikey), or [Anthropic](https://console.anthropic.com/settings/keys). Not needed for local Ollama.",
  },
  {
    key: "enableThinking",
    label: "Let reasoning models think",
    type: "toggle",
    description:
      "Off by default. When off: Gemini budget `0`, Anthropic thinking disabled, Qwen models get `/no_think` appended. On is slower and costlier.",
  },
  {
    key: "timeoutSeconds",
    label: "Timeout (seconds)",
    type: "text",
    placeholder: "180",
    description: "Max seconds before giving up. Default `180`.",
  },
  {
    key: "maxTokens",
    label: "Max Tokens",
    type: "text",
    placeholder: "2048",
    description:
      "Max tokens for the response. Default `2048`. Reasoning models need budget for thinking *and* answer; bump to `4096`+ for deep models.",
  },
  {
    key: "systemPrompt",
    label: "Custom System Prompt",
    type: "textarea",
    placeholder: DEFAULT_SYSTEM_PROMPT,
    description: "Override the default system prompt. Blank uses the default.",
  },
];

export interface AISummarySettings {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  systemPrompt: string;
  maxTokens: number;
  questionMarkOnly: boolean;
  enableThinking: boolean;
}

const _normaliseProvider = (raw: string): ProviderId => {
  const all = Object.values(ProviderId) as string[];
  return all.includes(raw) ? (raw as ProviderId) : ProviderId.OpenAICompat;
};

export const getAISummarySettings = async (): Promise<AISummarySettings> => {
  const stored = await getSettings(AI_SUMMARY_ID);
  const timeoutSeconds =
    parseFloat(asString(stored["timeoutSeconds"]) || "") || DEFAULT_TIMEOUT_S;
  const maxTokens =
    parseInt(asString(stored["maxTokens"]) || "", 10) || DEFAULT_MAX_TOKENS;
  return {
    provider: _normaliseProvider(asString(stored["provider"])),
    baseUrl: asString(stored["baseUrl"]),
    model: asString(stored["model"]),
    apiKey: asString(stored["apiKey"]),
    timeoutMs: Math.max(5, timeoutSeconds) * 1000,
    systemPrompt: asString(stored["systemPrompt"]),
    maxTokens: Math.max(16, maxTokens),
    questionMarkOnly: asBoolean(stored["questionMarkOnly"]),
    enableThinking: asBoolean(stored["enableThinking"]),
  };
};

export const summaryCache: AsyncTtlCache<string> = useCache<string>(
  SUMMARY_NAMESPACE,
  SHORT_TTL_MS,
);

export const summaryCacheKey = (
  query: string,
  results: { url: string; snippet: string }[],
): string => {
  const fp = results
    .slice(0, MAX_SOURCES)
    .map((r) => `${r.url}\n${r.snippet}`)
    .join("\n\n");
  const hash = createHash("sha256").update(fp).digest("hex").slice(0, 24);
  return `${query.trim().toLowerCase()}|${hash}`;
};

const _hostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export interface SourceContext {
  index: number;
  title: string;
  url: string;
  snippet: string;
  host: string;
}

export const buildSources = (results: ScoredResult[]): SourceContext[] =>
  results.slice(0, MAX_SOURCES).map((r, i) => ({
    index: i + 1,
    title: r.title || "",
    url: r.url,
    snippet: r.snippet || "",
    host: _hostname(r.url),
  }));

export const buildUserPrompt = (
  query: string,
  sources: SourceContext[],
): string => {
  const block = sources
    .map(
      (s) =>
        `[${s.index}] ${s.title}${s.host ? ` (${s.host})` : ""}\n${s.snippet}`,
    )
    .join("\n\n");
  return `Query: ${query.trim()}\n\nSearch results:\n${block}`;
};

const _escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildPanelHtml = (
  t: typeof TranslateFunction,
  query: string,
  sources: SourceContext[],
): string => {
  const sourcesJson = JSON.stringify(
    sources.map((s) => ({ i: s.index, u: s.url, t: s.title, h: s.host })),
  );
  return (
    '<div class="glance-ai degoog-panel degoog-panel--slot degoog-panel--slot-body-padded degoog-vstack"' +
    ` data-stream="1" data-query="${_escapeHtml(query)}"` +
    ` data-sources="${_escapeHtml(sourcesJson)}">` +
    '<div class="glance-ai-messages">' +
    '<div class="glance-snippet glance-ai-stream degoog-text degoog-text--md" data-state="pending">' +
    '<div class="skeleton-glance glance-ai-skeleton" aria-hidden="true">' +
    '<div class="skeleton-line skeleton-line--snippet"></div>' +
    '<div class="skeleton-line skeleton-line--snippet"></div>' +
    '<div class="skeleton-line skeleton-line--snippet-short"></div>' +
    "</div>" +
    "</div>" +
    "</div>" +
    '<div class="glance-ai-footer">' +
    `<span class="glance-ai-badge degoog-badge">${t("ai-summary.badge")}</span>` +
    `<button class="glance-ai-dive degoog-link-btn" type="button" hidden>${t("ai-summary.dive-deeper")}</button>` +
    "</div>" +
    '<div class="glance-ai-chat" hidden>' +
    `<textarea class="glance-ai-input degoog-input degoog-input--chat" placeholder="${t("ai-summary.follow-up-placeholder")}" rows="1"></textarea>` +
    "</div>" +
    "</div>"
  );
};

const aiSummarySlot: SlotPlugin = {
  id: AI_SUMMARY_ID,
  settingsId: AI_SUMMARY_ID,
  name: "AI Summary",
  waitForResults: true,
  get description(): string {
    return this.t!("ai-summary.description");
  },
  position: SlotPanelPosition.AtAGlance,
  isClientExposed: false,

  t: TranslateFunction,

  async trigger(query: string): Promise<boolean> {
    const settings = await getAISummarySettings();
    if (!settings.model) return false;
    if (
      settings.provider === ProviderId.OpenAICompat &&
      !settings.baseUrl
    ) {
      return false;
    }
    if (settings.provider !== ProviderId.OpenAICompat && !settings.apiKey) {
      return false;
    }
    if (settings.questionMarkOnly && !query.trim().endsWith("?")) return false;
    return true;
  },

  async execute(query, context): Promise<{ title?: string; html: string }> {
    const results = context?.results ?? [];
    if (results.length === 0) return { html: "" };
    const sources = buildSources(results);
    return { html: buildPanelHtml(this.t!, query.trim(), sources) };
  },
  settingsSchema: aiSummarySettingsSchema,
};

export const slot = aiSummarySlot;
