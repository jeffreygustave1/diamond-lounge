// Diamond Lounge AI backend — deploy as a Cloudflare Worker.
// Set OPENAI_API_KEY as a Worker secret. Optional vars: AI_MODEL, ALLOWED_ORIGIN.
const SYSTEM_PROMPT = `You are Diamond Support, the friendly AI help assistant for Diamond Lounge, a Discord-inspired community web app.
Help users naturally with navigation, DMs, profiles, servers, channels, invitations, voice calls, microphone/camera permissions, screen sharing, and general troubleshooting.
Known layout: exactly three primary columns: (1) server rail, (2) contextual sidebar, (3) main chat/content area. Do not suggest creating a fourth column or moving Diamond Support out of the third column.
Be concise, clear, and step-by-step. Ask one focused clarifying question when needed. Never claim you can see the user's screen, account, or site logs. Do not request passwords, verification codes, payment details, or private messages. If unsure about an app-specific detail, say so rather than inventing features. `;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin, allowed) });
    }
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, origin, allowed);
    if (!env.OPENAI_API_KEY) return json({ error: "AI service is not configured yet." }, 503, origin, allowed);
    if (allowed !== "*" && origin !== allowed) return json({ error: "Origin not allowed." }, 403, origin, allowed);
    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
      if (!messages.length || messages.some(m => !["user","assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 4000)) {
        return json({ error: "Invalid message history." }, 400, origin, allowed);
      }
      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.AI_MODEL || "gpt-4o-mini", messages: [{role:"system",content:SYSTEM_PROMPT}, ...messages], max_tokens:700 })
      });
      if (!completion.ok) {
        return json({ error: "The AI provider returned an error. Please try again." }, 502, origin, allowed);
      }
      const data = await completion.json();
      const answer = data.choices?.[0]?.message?.content;
      if (!answer) return json({ error: "No answer was returned." }, 502, origin, allowed);
      return json({ reply: answer }, 200, origin, allowed);
    } catch (e) {
      return json({ error: "Unable to process that message. Please try again." }, 500, origin, allowed);
    }
  }
};
function cors(origin, allowed) {
  return { "Access-Control-Allow-Origin": allowed === "*" ? "*" : origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
}
function json(data, status, origin, allowed) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(origin, allowed) } });
}
