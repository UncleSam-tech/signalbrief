import type { RawMention, TimeWindow } from "../types.js";

const HN_API_BASE = "https://hn.algolia.com/api/v1";

/** Convert a time window label to a Unix timestamp boundary */
function windowToTimestamp(window: TimeWindow): number {
  const now = Math.floor(Date.now() / 1000);
  const offsets: Record<TimeWindow, number> = {
    "24h": 86_400,
    "7d": 604_800,
    "30d": 2_592_000,
  };
  return now - offsets[window];
}

interface HNHit {
  objectID: string;
  title?: string | null;
  story_title?: string | null;
  comment_text?: string | null;
  story_text?: string | null;
  url?: string | null;
  story_url?: string | null;
  author?: string;
  created_at?: string;
  points?: number | null;
  num_comments?: number | null;
  created_at_i?: number;
}

interface HNSearchResponse {
  hits: HNHit[];
}

/** Strip HTML tags from HN comment text */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchHN(
  query: string,
  tag: "story" | "comment",
  since: number,
  hitsPerPage: number = 25,
): Promise<HNHit[]> {
  const params = new URLSearchParams({
    query,
    tags: tag,
    numericFilters: `created_at_i>${since}`,
    hitsPerPage: String(hitsPerPage),
  });

  const url = `${HN_API_BASE}/search_by_date?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HN API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as HNSearchResponse;
  return data.hits;
}

function hitToRawMention(hit: HNHit, isComment: boolean): RawMention {
  const hnItemUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  return {
    source: "hackernews",
    id: hit.objectID,
    title: isComment
      ? (hit.story_title ?? "")
      : (hit.title ?? ""),
    body: isComment
      ? stripHtml(hit.comment_text ?? "")
      : stripHtml(hit.story_text ?? ""),
    url: hit.url ?? hit.story_url ?? hnItemUrl,
    author: hit.author ?? "unknown",
    publishedAt: hit.created_at ?? new Date().toISOString(),
    points: hit.points ?? 0,
    numComments: hit.num_comments ?? 0,
  };
}

/**
 * Fetch mentions from Hacker News for a given query and time window.
 * Returns up to 50 results (25 stories + 25 comments), sorted by date.
 */
export async function fetchHNMentions(
  query: string,
  window: TimeWindow,
): Promise<RawMention[]> {
  const since = windowToTimestamp(window);

  const [stories, comments] = await Promise.all([
    searchHN(query, "story", since, 25),
    searchHN(query, "comment", since, 25),
  ]);

  const mentions: RawMention[] = [
    ...stories.map((h) => hitToRawMention(h, false)),
    ...comments.map((h) => hitToRawMention(h, true)),
  ];

  // Sort by most recent first
  mentions.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return mentions.slice(0, 50);
}
