export enum ProviderId {
  OpenAICompat = "openai-compat",
  Gemini = "gemini",
  Anthropic = "anthropic",
}

export enum ChunkKind {
  Text = "text",
  Thinking = "thinking",
  Done = "done",
  Error = "error",
}

export enum ChatRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StreamOptions {
  maxTokens: number;
  enableThinking: boolean;
  signal?: AbortSignal;
}

export type StreamChunk =
  | { kind: ChunkKind.Text; text: string }
  | { kind: ChunkKind.Thinking; text: string }
  | { kind: ChunkKind.Done; finishReason?: string }
  | { kind: ChunkKind.Error; message: string };

export interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  stream: (
    config: ProviderConfig,
    messages: ChatMessage[],
    opts: StreamOptions,
  ) => AsyncIterable<StreamChunk>;
}

export const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";
