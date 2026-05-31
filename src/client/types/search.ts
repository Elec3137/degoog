export type { SearchResult, ScoredResult, EngineTiming, SlotPanel, SearchResponse } from "../../shared/search-types";
export { SlotPanelPosition } from "../../shared/search-types";

export interface ImageFilter {
  color?: string;
  size?: string;
  type?: string;
  layout?: string;
  nsfw?: string;
}

export interface AtAGlance {
  snippet: string;
  url: string;
  title: string;
  sources: string[];
}

export interface KnowledgePanel {
  title: string;
  description: string;
  image?: string;
  url: string;
}

export interface NewsItem {
  title: string;
  url: string;
  thumbnail?: string;
  sources?: string[];
}
