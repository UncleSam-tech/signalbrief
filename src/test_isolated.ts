import { fetchRedditMentions } from "./sources/reddit.js";
import { fetchGitHubMentions } from "./sources/github.js";

async function test() {
  console.log("Fetching Github natively...");
  try {
    const gh = await fetchGitHubMentions("Stripe", "7d");
    console.log(`GitHub: ${gh.length}`);
  } catch(e) { console.error("GH Error", e); }

  console.log("Fetching Reddit natively...");
  try {
    const rd = await fetchRedditMentions("Stripe", "7d");
    console.log(`Reddit: ${rd.length}`);
  } catch(e) { console.error("RD Error", e); }
}

test().catch(console.error);
