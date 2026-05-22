import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { openAIAdapter } from "./openai";
import { ProviderAdapter, ProviderId } from "./types";

export * from "./types";

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  [ProviderId.OpenAICompat]: openAIAdapter,
  [ProviderId.Gemini]: geminiAdapter,
  [ProviderId.Anthropic]: anthropicAdapter,
};

export const pickAdapter = (id: string): ProviderAdapter => {
  const known = (Object.values(ProviderId) as string[]).includes(id)
    ? (id as ProviderId)
    : ProviderId.OpenAICompat;
  return ADAPTERS[known];
};
