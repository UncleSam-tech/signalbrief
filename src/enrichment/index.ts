import type { NormalizedMention, EnrichedMention, ThemeLabel, SentimentLabel } from "../types.js";
import { analyzeSentiment } from "./sentiment.js";
import { detectTheme } from "./themes.js";
import { scoreUrgency } from "./urgency.js";

// ─── Why-it-matters generation ─────────────────────────────────

function generateWhyItMatters(
  sentiment: SentimentLabel,
  theme: ThemeLabel,
  urgency: number,
): string {
  const urgencyWord =
    urgency >= 7 ? "High-urgency" : urgency >= 4 ? "Moderate" : "Low-urgency";

  const themeDescriptions: Record<ThemeLabel, string> = {
    pricing_complaints: "pricing concern that may drive churn",
    support_issues: "support or reliability issue that affects user trust",
    feature_requests: "feature gap that users want addressed",
    switching_intent: "signal of switching or competitor evaluation",
    praise: "positive sentiment that can be used in positioning",
    general_discussion: "general brand discussion worth monitoring",
  };

  return `${urgencyWord} ${sentiment} mention — ${themeDescriptions[theme]}.`;
}

/**
 * Enrich normalized mentions with sentiment, theme, urgency, and explanation.
 */
export function enrichMentions(
  mentions: NormalizedMention[],
): EnrichedMention[] {
  return mentions.map((m) => {
    const text = `${m.title} ${m.body}`.trim();
    const { label: sentiment, score: sentimentScore } = analyzeSentiment(text);
    const theme = detectTheme(text);
    const urgency = scoreUrgency(text, sentiment, m.engagement_score);
    const why_it_matters = generateWhyItMatters(sentiment, theme, urgency);

    return {
      ...m,
      sentiment,
      sentiment_score: sentimentScore,
      theme,
      urgency,
      why_it_matters,
    };
  });
}
