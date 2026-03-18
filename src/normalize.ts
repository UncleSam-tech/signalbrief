import type { RawMention, NormalizedMention } from "./types.js";

/**
 * Convert raw source-specific mentions into a uniform shape.
 * Engagement score = points + num_comments (a rough relevance proxy).
 */
export function normalizeMentions(
  raw: RawMention[],
  query: string,
): NormalizedMention[] {
  return raw.map((m) => ({
    source: m.source,
    query,
    title: m.title,
    body: m.body,
    url: m.url,
    author: m.author,
    published_at: m.publishedAt,
    engagement_score: m.points + m.numComments,
  }));
}
