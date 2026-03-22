import { fetchHNMentions } from "./sources/hn.js";
import { fetchRedditMentions } from "./sources/reddit.js";
import { fetchGitHubMentions } from "./sources/github.js";
import { normalizeMentions } from "./normalize.js";
import { enrichMentions } from "./enrichment/index.js";
import { generateBrief } from "./brief.js";

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T, label: string): Promise<T> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`[${label}] Request timed out after ${ms}ms`);
      resolve(fallback);
    }, ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        console.error(`[${label}] Fetch failed:`, err);
        resolve(fallback);
      });
  });
};

async function test() {
  const start = Date.now();
  console.log("Fetching Stripe 7d...");
  const [hn, reddit, github] = await Promise.all([
    withTimeout(fetchHNMentions("Stripe", "7d"), 4000, [], "HackerNews"),
    withTimeout(fetchRedditMentions("Stripe", "7d"), 4000, [], "Reddit"),
    withTimeout(fetchGitHubMentions("Stripe", "7d"), 4000, [], "GitHub"),
  ]);
  const end = Date.now();
  
  console.log(`HN: ${hn.length}, Reddit: ${reddit.length}, GitHub: ${github.length}`);
  console.log(`Time taken: ${end - start}ms`);
  
  const raw = [...hn, ...reddit, ...github];
  const normalized = normalizeMentions(raw, "Stripe");
  const enriched = enrichMentions(normalized);
  const brief = generateBrief("Stripe", "7d", enriched);
  
  console.log(JSON.stringify(brief).substring(0, 500));
}

test().catch(console.error);
