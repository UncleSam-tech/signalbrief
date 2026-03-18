import type { SentimentLabel } from "../types.js";

// ─── Churn / complaint amplifiers ──────────────────────────────

const URGENCY_AMPLIFIERS = [
  "cancel", "canceling", "cancelled", "churn", "leaving", "left",
  "switch", "switching", "urgent", "asap", "immediately", "broken",
  "outage", "down", "critical", "disaster", "nightmare", "unacceptable",
  "lawsuit", "legal", "refund", "scam",
];

/**
 * Score urgency from 0 (low) to 10 (high).
 *
 * Formula:
 *  - Start at base 3 (neutral)
 *  - Negative sentiment: +2; Positive: -2
 *  - Each urgency amplifier keyword found: +0.5 (capped at +3)
 *  - Engagement score contributes up to +2 (log-scaled)
 *  - Clamp to [0, 10]
 */
export function scoreUrgency(
  text: string,
  sentimentLabel: SentimentLabel,
  engagementScore: number,
): number {
  let score = 3;

  // Sentiment component
  if (sentimentLabel === "negative") score += 2;
  else if (sentimentLabel === "positive") score -= 2;

  // Amplifier keywords
  const lower = text.toLowerCase();
  let amplifierHits = 0;
  for (const kw of URGENCY_AMPLIFIERS) {
    if (lower.includes(kw)) amplifierHits++;
  }
  score += Math.min(amplifierHits * 0.5, 3);

  // Engagement component (log-scaled, 0–2 range)
  if (engagementScore > 0) {
    score += Math.min(Math.log10(engagementScore + 1), 2);
  }

  return Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
}
