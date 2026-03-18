import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createContextMiddleware } from "@ctxprotocol/sdk";
import { z } from "zod";

import { fetchHNMentions } from "./sources/hn.js";
import { normalizeMentions } from "./normalize.js";
import { enrichMentions } from "./enrichment/index.js";
import { generateBrief } from "./brief.js";
import type { TimeWindow, SocialBrief } from "./types.js";

// ─── Output schema (JSON Schema for MCP) ──────────────────────

const OUTPUT_SCHEMA = {
  type: "object" as const,
  description: "A structured social mention intelligence brief",
  properties: {
    query: {
      type: "string",
      description: "The brand, competitor, or keyword that was searched",
    },
    window: {
      type: "string",
      description: "Time window for the search (24h, 7d, or 30d)",
    },
    summary: {
      type: "string",
      description:
        "Human-readable summary of what people are saying, including mention count, overall sentiment, and key themes",
    },
    overall_sentiment: {
      type: "string",
      enum: ["positive", "neutral", "negative"],
      description:
        "Engagement-weighted overall sentiment across all retrieved mentions",
    },
    themes: {
      type: "array",
      description:
        "Theme clusters found in mentions, sorted by frequency descending",
      items: {
        type: "object",
        properties: {
          theme: {
            type: "string",
            enum: [
              "pricing_complaints",
              "support_issues",
              "feature_requests",
              "switching_intent",
              "praise",
              "general_discussion",
            ],
            description: "Theme category label",
          },
          mention_count: {
            type: "number",
            description: "Number of mentions in this theme",
          },
          percentage: {
            type: "number",
            description: "Percentage of total mentions in this theme (0-100)",
          },
        },
        required: ["theme", "mention_count", "percentage"],
      },
    },
    top_mentions: {
      type: "array",
      description:
        "The most important mentions sorted by urgency score descending, up to 5",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the story or parent story for comments",
          },
          body_snippet: {
            type: "string",
            description:
              "First 280 characters of the mention body text, truncated with ellipsis if longer",
          },
          url: {
            type: "string",
            description: "URL to the original mention",
          },
          author: { type: "string", description: "Author username" },
          published_at: {
            type: "string",
            description: "ISO 8601 publication timestamp",
          },
          sentiment: {
            type: "string",
            enum: ["positive", "neutral", "negative"],
            description: "Sentiment of this specific mention",
          },
          theme: {
            type: "string",
            description: "Primary theme detected in this mention",
          },
          urgency: {
            type: "number",
            description:
              "Urgency score from 0 (low) to 10 (high), combining sentiment, churn language, and engagement",
          },
          why_it_matters: {
            type: "string",
            description:
              "One-line explanation of why this mention deserves attention",
          },
        },
        required: [
          "title",
          "body_snippet",
          "url",
          "author",
          "published_at",
          "sentiment",
          "theme",
          "urgency",
          "why_it_matters",
        ],
      },
    },
    recommended_action: {
      type: "string",
      description:
        "Actionable recommendation based on dominant themes and overall sentiment",
    },
    fetched_at: {
      type: "string",
      description: "ISO 8601 timestamp of when this brief was generated",
    },
  },
  required: [
    "query",
    "window",
    "summary",
    "overall_sentiment",
    "themes",
    "top_mentions",
    "recommended_action",
    "fetched_at",
  ],
};

// ─── Pipeline ──────────────────────────────────────────────────

async function runPipeline(
  q: string,
  window: TimeWindow,
): Promise<SocialBrief> {
  const raw = await fetchHNMentions(q, window);
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

  mcpServer.tool(
    "get_social_brief",
    "Get a social mention intelligence brief for any brand, competitor, or keyword. Returns sentiment analysis, theme clusters, urgency-ranked top mentions, and an actionable recommendation based on public discussion from Hacker News.",
    {
      q: z.string().describe("Brand, competitor, or keyword to search for"),
      window: z
        .enum(["24h", "7d", "30d"])
        .default("7d")
        .describe("Time window: 24h (last day), 7d (last week), or 30d (last month)"),
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
