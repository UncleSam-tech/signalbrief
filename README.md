# SignalBrief

![SignalBrief](https://img.shields.io/badge/MCP-Enabled-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)

**SignalBrief** is an MCP-powered social mention intelligence tool designed for marketers and brand teams. It fetches, analyzes, and enriches public discussions (currently supporting Hacker News) to deliver actionable insights on brand sentiment, emerging themes, and competitor trends.

By running as a Model Context Protocol (MCP) Server, SignalBrief natively integrates with LLMs, providing them with structured data about how a brand or keyword is being discussed online.

## Features

- **Social Mention Fetching:** Pulls recent mentions for any keyword, brand, or competitor across configurable time windows (24h, 7d, 30d).
- **Sentiment & Urgency Enrichment:** Automatically scores mentions based on engagement, sentiment, and churn intent.
- **Theme Clustering:** Categorizes discussions into themes like pricing complaints, support issues, feature requests, switching intent, and praise.
- **Actionable Briefs:** Generates summarized intelligence briefs complete with recommended actions based on the dominant discussion themes.
- **MCP Native:** Provides the `get_social_brief` tool, enabling LLMs to dynamically query intelligence data.

## Requirements

- Node.js (v18 or higher)
- npm

## Installation

Clone the repository and install dependencies:

```bash
npm install
```

## Running the Server

### Development

Run the server with live reloading using `tsx`:

```bash
npm run dev
```

### Production

Build and start the compiled output:

```bash
npm run build
npm start
```

By default, the server runs on port `3000` (or `process.env.PORT`).

## Endpoints

- **`POST /mcp`**: The primary Model Context Protocol endpoint for LLM integrations. Supports session-based streamable HTTP transports.
- **`GET /health`**: Standard health check to verify service uptime.
- **`POST /debug/brief`**: A local testing endpoint to generate a brief without an MCP client.
  - *Example:* `http://localhost:3000/debug/brief?q=Apple&window=24h`

## MCP Tool Definition

When connected via an MCP client, the server exposes the following tool:

### `get_social_brief`
Fetches a social intelligence brief for the specified keyword.

| Argument  | Type   | Description |
|-----------|--------|-------------|
| `q`       | string | Brand, competitor, or keyword to search for |
| `window`  | enum   | Time window for search: `24h` (last day), `7d` (last week), or `30d` (last month). Defaults to `7d`. |

## Technology Stack

- **[Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)** - Standardized LLM interaction
- **[Express](https://expressjs.com/)** - Web server framework
- **[Zod](https://zod.dev/)** - Schema validation
- **TypeScript** - Strongly-typed language support
