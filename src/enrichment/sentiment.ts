import type { SentimentLabel } from "../types.js";

// ─── Word lists ────────────────────────────────────────────────

const POSITIVE_WORDS = new Set([
  "love", "great", "amazing", "awesome", "excellent", "fantastic", "wonderful",
  "best", "brilliant", "impressed", "happy", "good", "nice", "perfect",
  "solid", "reliable", "powerful", "fast", "easy", "clean", "beautiful",
  "recommend", "recommended", "enjoy", "enjoyed", "helpful", "superb",
  "outstanding", "intuitive", "elegant", "smooth", "incredible", "favorite",
  "pleased", "delighted", "efficient", "innovative", "remarkable", "superior",
]);

const NEGATIVE_WORDS = new Set([
  "hate", "terrible", "awful", "horrible", "worst", "bad", "poor", "broken",
  "slow", "expensive", "overpriced", "buggy", "unusable", "frustrating",
  "disappointed", "annoying", "useless", "waste", "ridiculous", "ugly",
  "clunky", "painful", "confusing", "complicated", "unreliable", "garbage",
  "disaster", "nightmare", "scam", "ripoff", "rip-off", "sucks", "trash",
  "mediocre", "lacking", "inferior", "flawed", "bloated", "cumbersome",
  "regret", "unfortunately", "worse", "downgrade", "unresponsive", "crash",
  "crashes", "crashing", "laggy", "lag",
]);

/**
 * Compute rule-based sentiment from text.
 * Returns a label and a score from -1.0 (very negative) to 1.0 (very positive).
 */
export function analyzeSentiment(text: string): {
  label: SentimentLabel;
  score: number;
} {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);

  let pos = 0;
  let neg = 0;

  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }

  const total = pos + neg;
  if (total === 0) return { label: "neutral", score: 0 };

  // Score ranges from -1 to +1
  const score = (pos - neg) / total;

  let label: SentimentLabel;
  if (score > 0.15) label = "positive";
  else if (score < -0.15) label = "negative";
  else label = "neutral";

  return { label, score: Math.round(score * 100) / 100 };
}
