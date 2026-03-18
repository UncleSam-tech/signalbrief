import type { RawMention, TimeWindow } from "../types.js";

const X_API_BASE = "https://api.twitter.com/2";

export async function fetchXMentions(
  query: string,
  window: TimeWindow,
): Promise<RawMention[]> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  
  if (!bearerToken) {
    console.warn("X_BEARER_TOKEN is not set, skipping X mentions fetch.");
    return [];
  }

  // Calculate start_time for 24h or 7d.
  // X API recent search only goes back 7 days max.
  const now = new Date();
  let startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // default to 7 days
  
  if (window === "24h") {
    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (window === "30d") {
    // Recent search cannot go past 7 days. We cap it at 7 days.
    console.warn("X API recent search is limited to 7 days. Falling back to 7 days for X data.");
  }

  // Build the query url
  // Note: the query string must not exceed 512 characters
  const searchParams = new URLSearchParams({
    query: `${query} -is:retweet`, // exclude retweets
    max_results: "25",
    "tweet.fields": "created_at,public_metrics",
    "user.fields": "username",
    expansions: "author_id",
    start_time: startTime.toISOString()
  });

  const url = `${X_API_BASE}/tweets/search/recent?${searchParams.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 403) {
        console.error("X API Error (403): Your developer tier may not support search, or the token is invalid.");
      }
      throw new Error(`X API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    
    if (!data.data) {
      // No mentions found
      return [];
    }

    // Map users for author lookup
    type XUser = { id: string; username: string };
    const userMap = new Map<string, string>();
    if (data.includes?.users) {
      data.includes.users.forEach((u: XUser) => {
        userMap.set(u.id, u.username);
      });
    }

    const mentions: RawMention[] = data.data.map((tweet: any) => {
      const author = userMap.get(tweet.author_id) ?? "unknown";
      return {
        source: "x",
        id: tweet.id,
        title: "", // Tweets don't have titles
        body: tweet.text ?? "",
        url: `https://x.com/${author}/status/${tweet.id}`,
        author: author,
        publishedAt: tweet.created_at ?? new Date().toISOString(),
        points: (tweet.public_metrics?.like_count ?? 0) + (tweet.public_metrics?.repost_count ?? 0),
        numComments: tweet.public_metrics?.reply_count ?? 0,
      };
    });

    return mentions;
  } catch (err) {
    console.error("Failed to fetch X mentions:", err);
    return []; // Return empty array on failure so pipeline doesn't completely break
  }
}
