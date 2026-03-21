import type { RawMention, TimeWindow } from "../types.js";

const REDDIT_API_BASE = "https://www.reddit.com";

/**
 * Convert TimeWindow to Reddit's 't' parameter values.
 */
function windowToRedditTime(window: TimeWindow): "day" | "week" | "month" {
  switch (window) {
    case "24h":
      return "day";
    case "7d":
      return "week";
    case "30d":
      return "month";
    default:
      return "week";
  }
}

export async function fetchRedditMentions(
  query: string,
  window: TimeWindow,
): Promise<RawMention[]> {
  const timeParam = windowToRedditTime(window);
  const searchParams = new URLSearchParams({
    q: query,
    sort: "new",
    t: timeParam,
    limit: "25",
  });

  const url = `${REDDIT_API_BASE}/search.json?${searchParams.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "SignalBrief/1.0 (MCP Server) WebApp (+https://ctxprotocol.com)",
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("Reddit API rate connected (429). Returning empty.");
        return [];
      }
      throw new Error(`Reddit API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!data?.data?.children) {
      return [];
    }

    const mentions: RawMention[] = data.data.children.map((child: any) => {
      const post = child.data;
      const permalink = post.permalink ? `${REDDIT_API_BASE}${post.permalink}` : post.url;
      
      return {
        source: "reddit",
        id: post.id || Math.random().toString(),
        title: post.title || "",
        body: post.selftext || "",
        url: permalink || url,
        author: post.author || "unknown",
        publishedAt: post.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : new Date().toISOString(),
        points: post.score || 0,
        numComments: post.num_comments || 0,
      };
    });

    return mentions;
  } catch (err) {
    console.error("Failed to fetch Reddit mentions:", err);
    return []; // Return empty array on failure so pipeline continues
  }
}
