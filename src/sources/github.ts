import type { RawMention, TimeWindow } from "../types.js";

const GITHUB_API_BASE = "https://api.github.com";

function getIsoDate(window: TimeWindow): string {
  const now = new Date();
  switch (window) {
    case "24h":
      now.setUTCDate(now.getUTCDate() - 1);
      break;
    case "7d":
      now.setUTCDate(now.getUTCDate() - 7);
      break;
    case "30d":
      now.setUTCDate(now.getUTCDate() - 30);
      break;
    default:
      now.setUTCDate(now.getUTCDate() - 7);
  }
  return now.toISOString().split("T")[0]; // YYYY-MM-DD
}

export async function fetchGitHubMentions(
  query: string,
  window: TimeWindow,
): Promise<RawMention[]> {
  const dateStr = getIsoDate(window);
  
  // Force exact-match phrase parsing if the AI failed to quote the query. 
  // This explicitly prevents multi-word explosions (e.g., "Notion software" pulling in every repo containing "software")
  let safeQuery = query.trim();
  if (!safeQuery.startsWith('"') && !safeQuery.endsWith('"')) {
    safeQuery = `"${safeQuery}"`;
  }
  
  const q = `${safeQuery} updated:>=${dateStr} is:issue`;
  
  const searchParams = new URLSearchParams({
    q,
    sort: "updated",
    order: "desc",
    per_page: "25",
  });

  const url = `${GITHUB_API_BASE}/search/issues?${searchParams.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "SignalBrief/1.0 (MCP Server)",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      if (res.status === 403) {
        console.warn("GitHub API rate limit hit (403). Returning empty array.");
        return [];
      }
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!data?.items) {
      return [];
    }

    const mentions: RawMention[] = data.items.map((issue: any) => {
      return {
        source: "github",
        id: issue.id.toString(),
        title: issue.title || "",
        body: issue.body || "",
        url: issue.html_url || url,
        author: issue.user?.login || "unknown",
        publishedAt: issue.updated_at || issue.created_at || new Date().toISOString(),
        points: issue.reactions?.total_count || 0,
        numComments: issue.comments || 0,
      };
    });

    return mentions;
  } catch (err) {
    console.error("Failed to fetch GitHub mentions:", err);
    return []; // Return empty array on failure so pipeline continues
  }
}
