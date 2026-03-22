import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

async function test() {
  const req = { method: "POST", headers: {}, url: "/mcp" } as any;
  const res = { 
    setHeader: () => {}, 
    writeHead: () => {}, 
    end: (data: any) => console.log("Response end:", data),
    on: () => {},
    once: () => {}
  } as any;
  const body = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } };

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => "test-session-id",
  });
  
  const server = new Server({ name: "test", version: "1.0" }, { capabilities: {} });
  
  console.log("Connecting server to transport...");
  await server.connect(transport);
  
  console.log("Handling request...");
  try {
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("Caught error:", err);
  }
}

test().catch(console.error);
