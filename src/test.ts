import { generateBrief } from "./brief.js";
import { normalizeMentions } from "./normalize.js";
import { enrichMentions } from "./enrichment/index.js";
import type { RawMention, SocialBrief, TimeWindow } from "./types.js";

// ─── Test helpers ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// ─── Mock data ─────────────────────────────────────────────────

const mockMentions: RawMention[] = [
  {
    source: "hn",
    id: "1",
    title: "Why I switched from Stripe to LemonSqueezy",
    body: "Stripe's pricing has become ridiculous. For small businesses, $30/mo plus percentage fees is too much. I moved to LemonSqueezy and saved 40%.",
    url: "https://news.ycombinator.com/item?id=1",
    author: "devuser1",
    publishedAt: new Date().toISOString(),
    points: 150,
    numComments: 42,
  },
  {
    source: "hn",
    id: "2",
    title: "Stripe just launched a new feature",
    body: "Great to see Stripe continuing to innovate. The new billing portal is exactly what we needed.",
    url: "https://news.ycombinator.com/item?id=2",
    author: "happycustomer",
    publishedAt: new Date().toISOString(),
    points: 80,
    numComments: 15,
  },
  {
    source: "hn",
    id: "3",
    title: "Ask HN: Best payment processor in 2025?",
    body: "We need a payment processor for our SaaS. Looking at Stripe vs Paddle. Any recommendations?",
    url: "https://news.ycombinator.com/item?id=3",
    author: "founder123",
    publishedAt: new Date().toISOString(),
    points: 35,
    numComments: 28,
  },
];

// ─── Test: Normalization ───────────────────────────────────────

console.log("\n📦 Normalization Tests");

const normalized = normalizeMentions(mockMentions, "Stripe");
assert(normalized.length === 3, "normalizes all 3 mentions");
assert(normalized[0].query === "Stripe", "sets query field");
assert(typeof normalized[0].engagement_score === "number", "computes engagement_score");
assert(normalized[0].published_at === mockMentions[0].publishedAt, "maps publishedAt → published_at");

// ─── Test: Enrichment ──────────────────────────────────────────

console.log("\n🔬 Enrichment Tests");

const enriched = enrichMentions(normalized);
assert(enriched.length === 3, "enriches all 3 mentions");
assert(
  ["positive", "neutral", "negative"].includes(enriched[0].sentiment),
  "sentiment is a valid label"
);
assert(
  typeof enriched[0].sentiment_score === "number" &&
    enriched[0].sentiment_score >= -1 &&
    enriched[0].sentiment_score <= 1,
  "sentiment_score is in [-1, 1]"
);
assert(
  [
    "pricing_complaints",
    "support_issues",
    "feature_requests",
    "switching_intent",
    "praise",
    "general_discussion",
  ].includes(enriched[0].theme),
  "theme is a valid label"
);
assert(
  typeof enriched[0].urgency === "number" &&
    enriched[0].urgency >= 0 &&
    enriched[0].urgency <= 10,
  "urgency is in [0, 10]"
);
assert(typeof enriched[0].why_it_matters === "string" && enriched[0].why_it_matters.length > 0, "why_it_matters is non-empty");

// ─── Test: Brief generation ────────────────────────────────────

console.log("\n📊 Brief Generation Tests");

const brief: SocialBrief = generateBrief("Stripe", "7d", enriched, [
  { source: "HackerNews", mention_count: 3 },
  { source: "Reddit", mention_count: 0 },
  { source: "GitHub", mention_count: 0 }
]);
assert(brief.query === "Stripe", "brief.query matches input");
assert(brief.window === "7d", "brief.window matches input");
assert(typeof brief.summary === "string" && brief.summary.length > 0, "summary is non-empty string");
assert(
  ["positive", "neutral", "negative"].includes(brief.overall_sentiment),
  "overall_sentiment is valid"
);
assert(Array.isArray(brief.themes), "themes is an array");
assert(brief.themes.length > 0, "themes is non-empty");
assert(
  brief.themes.every(
    (t) =>
      typeof t.theme === "string" &&
      typeof t.mention_count === "number" &&
      typeof t.percentage === "number"
  ),
  "each theme has required fields"
);
assert(Array.isArray(brief.top_mentions), "top_mentions is an array");
assert(brief.top_mentions.length > 0 && brief.top_mentions.length <= 5, "top_mentions has 1-5 items");
assert(
  brief.top_mentions.every(
    (m) =>
      typeof m.title === "string" &&
      typeof m.body_snippet === "string" &&
      typeof m.url === "string" &&
      typeof m.author === "string" &&
      typeof m.published_at === "string" &&
      typeof m.sentiment === "string" &&
      typeof m.theme === "string" &&
      typeof m.urgency === "number" &&
      typeof m.why_it_matters === "string"
  ),
  "each top_mention has all required fields"
);
assert(typeof brief.recommended_action === "string" && brief.recommended_action.length > 0, "recommended_action is non-empty");
assert(typeof brief.fetched_at === "string" && !isNaN(Date.parse(brief.fetched_at)), "fetched_at is valid ISO timestamp");

// ─── Test: Brief with no mentions ──────────────────────────────

console.log("\n📊 Empty Brief Tests");

const emptyBrief = generateBrief("UnknownBrand12345", "24h", [], [
  { source: "HackerNews", mention_count: 0 },
  { source: "Reddit", mention_count: 0 },
  { source: "GitHub", mention_count: 0 }
]);
assert(emptyBrief.query === "UnknownBrand12345", "empty brief query matches");
assert(emptyBrief.themes.length === 0, "empty brief has no themes");
assert(emptyBrief.top_mentions.length === 0, "empty brief has no top_mentions");
assert(emptyBrief.overall_sentiment === "neutral", "empty brief sentiment is neutral");

// ─── Test: Output matches outputSchema structure ───────────────

console.log("\n🔎 OutputSchema Compliance Tests");

const requiredKeys = [
  "query",
  "window",
  "summary",
  "sources_searched",
  "overall_sentiment",
  "themes",
  "top_mentions",
  "recommended_action",
  "fetched_at",
];

for (const key of requiredKeys) {
  assert(key in brief, `brief has required key: ${key}`);
  const val = (brief as unknown as Record<string, unknown>)[key];
  assert(
    val !== undefined && val !== null,
    `brief.${key} is not null/undefined`
  );
}

// ─── Summary ───────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
