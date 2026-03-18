import type { ThemeLabel } from "../types.js";

// ─── Theme keyword patterns ───────────────────────────────────

interface ThemePattern {
  theme: ThemeLabel;
  keywords: string[];
}

const THEME_PATTERNS: ThemePattern[] = [
  {
    theme: "pricing_complaints",
    keywords: [
      "expensive", "overpriced", "cost", "pricing", "price", "pricey",
      "afford", "subscription", "per month", "per year", "per seat",
      "too much", "cheaper", "free tier", "free plan", "budget", "pay",
      "paying", "charge", "charges", "invoice", "billing", "fee", "fees",
      "$", "dollar", "enterprise pricing", "quote",
    ],
  },
  {
    theme: "support_issues",
    keywords: [
      "support", "bug", "broken", "issue", "issues", "help", "problem",
      "problems", "ticket", "response time", "customer service", "cs",
      "unresponsive", "outage", "downtime", "error", "errors", "fix",
      "not working", "doesn't work", "won't work", "can't use",
      "documentation", "docs", "onboarding",
    ],
  },
  {
    theme: "feature_requests",
    keywords: [
      "wish", "should", "need", "would be nice", "feature", "missing",
      "roadmap", "please add", "request", "requesting", "suggestion",
      "integrate", "integration", "api", "plugin", "export", "import",
      "customization", "customize", "option", "options", "want",
    ],
  },
  {
    theme: "switching_intent",
    keywords: [
      "switch", "switching", "alternative", "alternatives", "migrate",
      "migrating", "migration", "cancel", "canceling", "cancelled",
      "moving to", "moved to", "replaced", "replacing", "instead of",
      "competitor", "competitors", "vs", "versus", "comparison",
      "better than", "looking for", "ditched", "dumped", "left",
      "leaving", "churn",
    ],
  },
  {
    theme: "praise",
    keywords: [
      "love", "great", "amazing", "best", "awesome", "excellent",
      "fantastic", "wonderful", "brilliant", "impressive", "solid",
      "reliable", "game changer", "recommend", "recommended",
      "favorite", "favourite", "outstanding", "remarkable", "enjoy",
      "pleased", "happy with",
    ],
  },
];

/**
 * Detect the primary theme of a mention based on keyword matching.
 * Returns the theme with the highest keyword hit count, or "general_discussion".
 */
export function detectTheme(text: string): ThemeLabel {
  const lower = text.toLowerCase();
  let bestTheme: ThemeLabel = "general_discussion";
  let bestScore = 0;

  for (const pattern of THEME_PATTERNS) {
    let score = 0;
    for (const kw of pattern.keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTheme = pattern.theme;
    }
  }

  return bestTheme;
}
