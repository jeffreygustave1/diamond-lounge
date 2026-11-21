// Minimal read-only MCP endpoint for Diamond Lounge (preview branch).
// Supports Streamable HTTP JSON-RPC: initialize, notifications/initialized,
// tools/list, and tools/call. No repository writes or secret access.
const VERSION = "2025-03-26";

function jsonRpc(id, result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function errorRpc(id, code, message) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequest({ request }) {
  if (request.method === "GET") {
    return new Response("Diamond Lounge MCP endpoint. POST JSON-RPC requests.", {
      headers: { "Content-Type": "text/plain" }
    });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return errorRpc(body?.id ?? null, -32600, "Invalid JSON-RPC request");
  if (body.method === "notifications/initialized" || body.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (body.method === "initialize") {
    return jsonRpc(body.id, {
      protocolVersion: VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "diamond-lounge-mcp", version: "0.1.0" }
    });
  }
  if (body.method === "ping") return jsonRpc(body.id, {});
  if (body.method === "tools/list") {
    return jsonRpc(body.id, {
      tools: [{
        name: "diamond_lounge_status",
        description: "Returns a read-only overview of Diamond Lounge project and preview branch status. Does not access private accounts or make changes.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      }]
    });
  }
  if (body.method === "tools/call") {
    const name = body.params?.name;
    if (name !== "diamond_lounge_status") return errorRpc(body.id, -32602, "Unknown tool");
    return jsonRpc(body.id, {
      content: [{ type: "text", text: "Diamond Lounge project. Repository: jeffreygustave1/diamond-lounge. Preview branch: secure-turn-credentials. This MCP server currently offers read-only status information only. It is not authorized to deploy to production, change account settings, or revoke credentials." }],
      isError: false
    });
  }
  return errorRpc(body.id, -32601, "Method not found");
}
