import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createContextMiddleware } from "@ctxprotocol/sdk";
import { z } from "zod";

import { fetchHNMentions } from "./sources/hn.js";
import { fetchXMentions } from "./sources/x.js";
import { normalizeMentions } from "./normalize.js";
import { enrichMentions } from "./enrichment/index.js";
import { generateBrief } from "./brief.js";
import type { TimeWindow, SocialBrief } from "./types.js";
// ─── Output schema (Zod for MCP registerTool) ─────────────────

const OUTPUT_SCHEMA = z.object({
  query: z.string().describe("The brand, competitor, or keyword that was searched"),
  window: z.string().describe("Time window for the search (24h, 7d, or 30d)"),
  summary: z.string().describe(
    "Human-readable summary of what people are saying, including mention count, overall sentiment, and key themes",
  ),
  overall_sentiment: z
    .enum(["positive", "neutral", "negative"])
    .describe("Engagement-weighted overall sentiment across all retrieved mentions"),
  themes: z
    .array(
      z.object({
        theme: z
          .enum([
            "pricing_complaints",
            "support_issues",
            "feature_requests",
            "switching_intent",
            "praise",
            "general_discussion",
          ])
          .describe("Theme category label"),
        mention_count: z.number().describe("Number of mentions in this theme"),
        percentage: z.number().describe("Percentage of total mentions in this theme (0-100)"),
      }),
    )
    .describe("Theme clusters found in mentions, sorted by frequency descending"),
  top_mentions: z
    .array(
      z.object({
        title: z.string().describe("Title of the story or parent story for comments"),
        body_snippet: z.string().describe(
          "First 280 characters of the mention body text, truncated with ellipsis if longer",
        ),
        url: z.string().describe("URL to the original mention"),
        author: z.string().describe("Author username"),
        published_at: z.string().describe("ISO 8601 publication timestamp"),
        sentiment: z
          .enum(["positive", "neutral", "negative"])
          .describe("Sentiment of this specific mention"),
        theme: z.string().describe("Primary theme detected in this mention"),
        urgency: z.number().describe(
          "Urgency score from 0 (low) to 10 (high), combining sentiment, churn language, and engagement",
        ),
        why_it_matters: z.string().describe(
          "One-line explanation of why this mention deserves attention",
        ),
      }),
    )
    .describe("The most important mentions sorted by urgency score descending, up to 5"),
  recommended_action: z.string().describe(
    "Actionable recommendation based on dominant themes and overall sentiment",
  ),
  fetched_at: z.string().describe("ISO 8601 timestamp of when this brief was generated"),
}).describe("A structured social mention intelligence brief");

// ─── Pipeline ──────────────────────────────────────────────────

async function runPipeline(
  q: string,
  window: TimeWindow,
): Promise<SocialBrief> {
  const [hnRaw, xRaw] = await Promise.all([
    fetchHNMentions(q, window),
    fetchXMentions(q, window)
  ]);
  
  // Combine all raw mentions, sorting them by date descending overall
  const raw = [...hnRaw, ...xRaw].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const normalized = normalizeMentions(raw, q);
  const enriched = enrichMentions(normalized);
  const brief = generateBrief(q, window, enriched);
  return brief;
}

// ─── MCP Server ────────────────────────────────────────────────

export function createSignalBriefServer() {
  const mcpServer = new McpServer(
    {
      name: "signalbrief",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  mcpServer.registerTool(
    "get_social_brief",
    {
      description:
        "Get a social mention intelligence brief for any brand, competitor, or keyword. Aggregates mentions from Hacker News and X (Twitter), then returns sentiment analysis, theme clusters, urgency-ranked top mentions, and an actionable recommendation.",
      inputSchema: {
        q: z.string().describe("Brand, competitor, or keyword to search for"),
        window: z
          .enum(["24h", "7d", "30d"])
          .default("7d")
          .describe("Time window: 24h (last day), 7d (last week), or 30d (last month)"),
      },
      outputSchema: OUTPUT_SCHEMA,
      _meta: {
        surface: "both",
        queryEligible: true,
        latencyClass: "slow",
        rateLimit: {
          maxRequestsPerMinute: 10,
          cooldownMs: 6000,
          maxConcurrency: 2,
          notes: "Rate limited by upstream X API (Basic tier) and HN Algolia API.",
        },
        pricing: {
          executeUsd: "0.00",
        },
      },
    },
    async ({ q, window }) => {
      try {
        const brief = await runPipeline(q, window as TimeWindow);

        return {
          content: [
            {
              type: "text" as const,
              text: `${brief.summary}\n\nRecommended action: ${brief.recommended_action}`,
            },
          ],
          structuredContent: brief as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          structuredContent: {
            query: q,
            window: window,
            summary: `Error fetching mentions: ${message}`,
            overall_sentiment: "neutral",
            themes: [],
            top_mentions: [],
            recommended_action: "Retry the query. If the issue persists, check the server logs.",
            fetched_at: new Date().toISOString(),
          } as unknown as Record<string, unknown>,
          isError: true,
        };
      }
    },
  );

  return mcpServer;
}

// ─── Express app ───────────────────────────────────────────────

const app = express();
app.use(express.json());

// Context Protocol security middleware on /mcp
app.use("/mcp", createContextMiddleware());



// Streamable HTTP transport for MCP
// We need per-session transports for stateful MCP
const transports = new Map<string, StreamableHTTPServerTransport>();

app.all("/mcp", async (req, res) => {
  try {
    // For initialization requests, create a new transport
    const body = req.body;
    const isInitialize =
      body?.method === "initialize" ||
      (Array.isArray(body) && body.some((m: { method?: string }) => m.method === "initialize"));

    if (isInitialize || req.method === "GET") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports.set(sessionId, transport);
        },
      });

      transport.onclose = () => {
        const sid = (transport as unknown as { sessionId?: string }).sessionId;
        if (sid) transports.delete(sid);
      };

      const mcpServer = createSignalBriefServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // For subsequent requests, look up existing transport by session ID
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // No session found — tell client to re-initialize
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "No active session. Send initialize first." },
      id: body?.id ?? null,
    });
  } catch (err) {
    console.error("MCP handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// ─── Health check ──────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "signalbrief", version: "1.0.0" });
});

// ─── Debug route (bypasses MCP protocol for local testing) ─────

app.get("/", (_req, res) => {
  res.send(`
    <html>
      <body style="font-family: system-ui, sans-serif; padding: 2rem;">
        <h1>SignalBrief MCP Server is running</h1>
        <ul>
          <li><strong>Health:</strong> <a href="/health">/health</a></li>
          <li><strong>MCP Endpoint:</strong> /mcp (POST only)</li>
          <li><strong>Debug Brief:</strong> <a href="/debug/brief?q=Apple&window=24h">/debug/brief?q=Apple&window=24h</a></li>
        </ul>
      </body>
    </html>
  `);
});

app.all("/debug/brief", async (req, res) => {
  try {
    const q = (req.body?.q || req.query?.q) as string | undefined;
    const win = (req.body?.window || req.query?.window) as string | undefined;

    if (!q) {
      res.status(400).json({ error: "Missing required parameter: q" });
      return;
    }

    const validWindows: TimeWindow[] = ["24h", "7d", "30d"];
    const timeWindow: TimeWindow = validWindows.includes(win as TimeWindow)
      ? (win as TimeWindow)
      : "7d";

    const brief = await runPipeline(q, timeWindow);
    res.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Debug brief error:", message);
    res.status(500).json({ error: message });
  }
});

// ─── Start ─────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);

app.listen(PORT, () => {
  console.log(`✓ SignalBrief MCP server running on http://localhost:${PORT}`);
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  Debug brief:  POST http://localhost:${PORT}/debug/brief`);
});
