import type {
  EnrichedMention,
  SocialBrief,
  ThemeSummary,
  TopMention,
  SentimentLabel,
  ThemeLabel,
} from "./types.js";

// ─── Aggregate overall sentiment ───────────────────────────────

function computeOverallSentiment(
  mentions: EnrichedMention[],
): SentimentLabel {
  if (mentions.length === 0) return "neutral";

  // Engagement-weighted average of sentiment scores
  let weightedSum = 0;
  let totalWeight = 0;

  for (const m of mentions) {
    const weight = Math.max(m.engagement_score, 1);
    weightedSum += m.sentiment_score * weight;
    totalWeight += weight;
  }

  const avg = weightedSum / totalWeight;
  if (avg > 0.15) return "positive";
  if (avg < -0.15) return "negative";
  return "neutral";
}

// ─── Aggregate theme counts ────────────────────────────────────

function aggregateThemes(mentions: EnrichedMention[]): ThemeSummary[] {
  const counts = new Map<ThemeLabel, number>();

  for (const m of mentions) {
    counts.set(m.theme, (counts.get(m.theme) ?? 0) + 1);
  }

  const total = mentions.length || 1;
  const themes: ThemeSummary[] = [];

  for (const [theme, count] of counts) {
    themes.push({
      theme,
      mention_count: count,
      percentage: Math.round((count / total) * 100),
    });
  }

  // Sort by count descending
  themes.sort((a, b) => b.mention_count - a.mention_count);
  return themes;
}

// ─── Pick top mentions ─────────────────────────────────────────

function pickTopMentions(
  mentions: EnrichedMention[],
  limit: number = 10,
): TopMention[] {
  // First, group by theme and pick the top 2 from each theme
  const byTheme = new Map<string, EnrichedMention[]>();
  for (const m of [...mentions].sort((a, b) => b.urgency - a.urgency)) {
    if (!byTheme.has(m.theme)) byTheme.set(m.theme, []);
    byTheme.get(m.theme)!.push(m);
  }

  const selected = new Set<EnrichedMention>();
  // 1. Ensure up to 2 top mentions from EVERY theme are included
  for (const themeMentions of byTheme.values()) {
    themeMentions.slice(0, 2).forEach((m) => selected.add(m));
  }

  // 2. Fill the rest of the limit with the most urgent remaining mentions
  const remainingRemaining = [...mentions]
    .sort((a, b) => b.urgency - a.urgency)
    .filter((m) => !selected.has(m));

  for (const m of remainingRemaining) {
    if (selected.size >= limit) break;
    selected.add(m);
  }

  // 3. Final sort by urgency for the output
  const finalSorted = Array.from(selected).sort((a, b) => b.urgency - a.urgency);

  return finalSorted.map((m) => ({
    title: m.title,
    body_snippet: m.body.length > 280 ? m.body.slice(0, 277) + "..." : m.body,
    url: m.url,
    author: m.author,
    published_at: m.published_at,
    sentiment: m.sentiment,
    theme: m.theme,
    urgency: m.urgency,
    why_it_matters: m.why_it_matters,
  }));
}

// ─── Generate recommended action ───────────────────────────────

function generateRecommendation(
  themes: ThemeSummary[],
  overallSentiment: SentimentLabel,
): string {
  if (themes.length === 0) {
    return "No significant mentions detected. Continue monitoring.";
  }

  const dominant = themes[0].theme;

  const recommendations: Record<ThemeLabel, string> = {
    pricing_complaints:
      "Pricing is the dominant concern. Review pricing page messaging, consider publishing ROI calculators or comparison content, and prepare objection-handling materials for sales.",
    support_issues:
      "Support and reliability issues are the main topic. Audit recent support tickets, review onboarding flows, and consider publishing a status page or reliability update.",
    feature_requests:
      "Users are actively requesting features. Review the top requests against your roadmap, consider publishing a public roadmap or changelog, and respond to high-engagement threads.",
    switching_intent:
      "Switching intent is high. Prioritize competitive positioning, create migration guides from competitors, and consider targeted retention campaigns.",
    praise:
      "Sentiment is strongly positive. Leverage this in marketing — collect testimonials, amplify positive mentions in social channels, and use quotes in sales collateral.",
    general_discussion:
      "Discussion is general and mixed. Monitor for emerging patterns and engage where relevant to build brand presence.",
  };

  let action = recommendations[dominant];

  // Add sentiment overlay if it contradicts the theme
  if (dominant === "praise" && overallSentiment === "negative") {
    action +=
      " However, overall sentiment is negative — look beyond the praise for underlying issues.";
  } else if (dominant !== "praise" && overallSentiment === "positive") {
    action +=
      " Note: overall sentiment is positive despite this theme, suggesting the issue is not widespread.";
  }

  return action;
}

// ─── Generate summary text ─────────────────────────────────────

function generateSummary(
  query: string,
  window: string,
  mentions: EnrichedMention[],
  overallSentiment: SentimentLabel,
  themes: ThemeSummary[],
): string {
  if (mentions.length === 0) {
    return `No public mentions found for "${query}" in the last ${window}.`;
  }

  const topThemes = themes
    .slice(0, 3)
    .map((t) => t.theme.replace(/_/g, " "))
    .join(", ");

  return (
    `Found ${mentions.length} public mentions of "${query}" in the last ${window}. ` +
    `Overall sentiment is ${overallSentiment}. ` +
    `Key themes: ${topThemes}.`
  );
}

// ─── Main brief generator ──────────────────────────────────────

/**
 * Generate a complete social intelligence brief from enriched mentions.
 */
export function generateBrief(
  query: string,
  window: string,
  mentions: EnrichedMention[],
): SocialBrief {
  const overallSentiment = computeOverallSentiment(mentions);
  const themes = aggregateThemes(mentions);
  const topMentions = pickTopMentions(mentions);
  const summary = generateSummary(query, window, mentions, overallSentiment, themes);
  const recommendedAction = generateRecommendation(themes, overallSentiment);

  const brief: SocialBrief = {
    query,
    window,
    summary,
    overall_sentiment: overallSentiment,
    themes,
    top_mentions: topMentions,
    recommended_action: recommendedAction,
    fetched_at: new Date().toISOString(),
  };

  // Signal absence explicitly to Context Protocol
  if (mentions.length === 0) {
    brief.searchExhausted = true;
    brief.noResultsReason = "no_matching_data_found";
  }

  return brief;
}
