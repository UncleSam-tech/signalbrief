const PORT = process.env.PORT || 3000;
const ENDPOINT = `http://localhost:${PORT}/mcp`;

async function runAnalysis() {
  console.log("== Weekly MCP Reliability Analysis ==\n");

  // Step 1: Initialize
  console.log("1. Initializing MCP Session...");
  const initRes = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "analyzer", version: "1.0.0" } },
    }),
  });

  const sessionId = initRes.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("Failed to initialize session. No mcp-session-id returned.");
  }
  console.log(`✅ Session bound: ${sessionId}`);

  // Step 2: Test proper query
  console.log("\n2. Testing valid data evaluation response...");
  const validRes = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-session-id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_social_brief", arguments: { q: "Apple" } },
    }),
  });
  
  let validData;
  const validText = await validRes.text();
  if (validText.includes("event: message") && validText.includes("data: ")) {
    validData = JSON.parse(validText.split("\n").find(l => l.startsWith("data: "))!.replace("data: ", ""));
  } else {
    validData = JSON.parse(validText);
  }
  
  if (validData.error) {
    console.error("Valid query responded with an unhandled runtime error:", validData.error);
    process.exit(1);
  }
  const structuredContent = validData.result?.structuredContent;
  if (!structuredContent) {
    console.error("Payload dropped structuredContent", validData);
    process.exit(1);
  }
  if (!Array.isArray(structuredContent.sources_searched)) {
    console.error("Schema Violation: sources_searched must be an array on success response.");
    process.exit(1);
  }
  console.log(`✅ Valid query successful. Completed extraction framework.`);

  // Step 3: Test boundary schema compliance
  console.log("\n3. Testing edge case schema constraints (missing query)...");
  const badRes = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-session-id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_social_brief", arguments: {} },
    }),
  });

  let badData;
  const badText = await badRes.text();
  if (badText.includes("event: message") && badText.includes("data: ")) {
    badData = JSON.parse(badText.split("\n").find(l => l.startsWith("data: "))!.replace("data: ", ""));
  } else {
    badData = JSON.parse(badText);
  }
  
  // We expect a valid JSON-RPC successful resolution that has `isError: true` inside result
  const result = badData.result;
  if (!result || !result.isError) {
    console.error("Expected gracefull error handling format. Got:", badData);
    process.exit(1);
  }

  const badStructured = result.structuredContent;
  if (!Array.isArray(badStructured.sources_searched)) {
    console.error("❌ SCHEMA VIOLATION! Error payload missing sources_searched array.");
    process.exit(1);
  }
  console.log("✅ Error payload correctly adheres to outputSchema format.");
  
  console.log("\n🚀 All Weekly Reliability Checks Passed.");
}

runAnalysis().catch((e) => {
  console.error("Analysis failed:", e);
  process.exit(1);
});
