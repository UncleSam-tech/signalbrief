const PORT = 3008;

async function testHealth() {
  console.log("Testing GET /health...");
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    const data = await res.json();
    console.log("Health response:", data);
  } catch (err) {
    console.error("Health check failed:", err);
  }
}

async function testDebug() {
  console.log("\nTesting POST /debug/brief...");
  try {
    const res = await fetch(`http://localhost:${PORT}/debug/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: "Apple", window: "24h" }),
    });
    if (!res.ok) {
      console.error(`Debug request failed: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(text);
      return;
    }
    const data = await res.json();
    console.log("Debug brief metadata for Apple:");
    console.log("- Query:", data.query);
    console.log("- Summary:", data.summary);
    console.log("- Overall Sentiment:", data.overall_sentiment);
    console.log("- Mentions Examined:", data.themes.reduce((acc: number, t: any) => acc + t.mention_count, 0));
  } catch (err) {
    console.error("Debug brief failed:", err);
  }
}

async function testMCP() {
  console.log("\nTesting POST /mcp (MCP Initialization)...");
  try {
    // 1. Initialize
    const initRes = await fetch(`http://localhost:${PORT}/mcp`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });
    const sessionId = initRes.headers.get("mcp-session-id") ?? undefined;
    const initData = await initRes.text();
    console.log("Initialize Response:", initRes.status);
    console.log("Response Text:", initData);
    console.log("Session ID:", sessionId);

    // If session initialized properly, we can test tools/list
    if (sessionId) {
      console.log("\nTesting POST /mcp (tools/list)...");
      const listRes = await fetch(`http://localhost:${PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      });
      const listData = await listRes.json();
      console.log("Available tools:");
      if (listData.result?.tools) {
        listData.result.tools.forEach((t: any) => {
          console.log(`- ${t.name}: ${t.description}`);
        });
      } else {
        console.log("Could not parse tools list:", listData);
      }
    }
  } catch (err) {
    console.error("MCP test failed:", err);
  }
}

async function runTests() {
  await testHealth();
  await testMCP();
  await testDebug();
}

runTests().catch(console.error);
