// ─── Raw mention from any source ───────────────────────────────

export interface RawMention {
  source: string;
  id: string;
  title: string;
  body: string;
  url: string;
  author: string;
  publishedAt: string; // ISO 8601
  points: number;
  numComments: number;
}

// ─── After normalization ───────────────────────────────────────

export interface NormalizedMention {
  source: string;
  query: string;
  title: string;
  body: string;
  url: string;
  author: string;
  published_at: string;
  engagement_score: number;
}

// ─── After enrichment ──────────────────────────────────────────

export type SentimentLabel = "positive" | "neutral" | "negative";

export type ThemeLabel =
  | "pricing_complaints"
  | "support_issues"
  | "feature_requests"
  | "switching_intent"
  | "praise"
  | "general_discussion";

export interface EnrichedMention extends NormalizedMention {
  sentiment: SentimentLabel;
  sentiment_score: number; // -1.0 to 1.0
  theme: ThemeLabel;
  urgency: number; // 0–10
  why_it_matters: string;
}

// ─── Final brief output ────────────────────────────────────────

export interface ThemeSummary {
  theme: ThemeLabel;
  mention_count: number;
  percentage: number;
}

export interface TopMention {
  title: string;
  body_snippet: string;
  url: string;
  author: string;
  published_at: string;
  sentiment: SentimentLabel;
  theme: ThemeLabel;
  urgency: number;
  why_it_matters: string;
}

export interface SourceSummary {
  source: string;
  mention_count: number;
}

export interface SocialBrief {
  query: string;
  window: string;
  summary: string;
  sources_searched: SourceSummary[];
  overall_sentiment: SentimentLabel;
  themes: ThemeSummary[];
  top_mentions: TopMention[];
  recommended_action: string;
  fetched_at: string;
  searchExhausted?: boolean;
  noResultsReason?: string;
}

// ─── Input types ───────────────────────────────────────────────

export type TimeWindow = "24h" | "7d" | "30d";

export interface BriefRequest {
  q: string;
  window: TimeWindow;
}
