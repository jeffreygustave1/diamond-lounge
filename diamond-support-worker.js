// Diamond Lounge AI backend — deploy as a Cloudflare Worker.
// Set OPENAI_API_KEY as a Worker secret. Optional vars: AI_MODEL, ALLOWED_ORIGIN.
const SYSTEM_PROMPT = `You are Diamond Support, a helpful assistant inside Diamond Lounge.
Help with Diamond Lounge navigation, DMs, profiles, servers, channels, invitations, voice calls, microphone/camera permissions, screen sharing, and troubleshooting.
You may also answer ordinary questions outside Diamond Lounge. Do not dismiss unrelated questions or redirect users back to app troubleshooting; answer the question directly when you can.
For current events, breaking news, release schedules, game patches, prices, and other time-sensitive questions, the backend may enable live web search. When live search is used, rely on the retrieved sources, cite them in the answer, prioritize official sources, and distinguish confirmed dates from estimates. Never invent a release date. If official sources have not announced a date, say so clearly.
Known Diamond Lounge layout: exactly three primary columns: (1) server rail, (2) contextual sidebar, (3) main chat/content area. Do not suggest creating a fourth column or moving Diamond Support out of the third column.
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
      const useWebSearch = shouldUseWebSearch(messages);
      const model = useWebSearch ? (env.SEARCH_MODEL || "gpt-5-search-api") : (env.AI_MODEL || "gpt-4o-mini");
      const requestBody = {
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: useWebSearch ? 900 : 700
      };
      if (useWebSearch) requestBody.web_search_options = {};

      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      if (!completion.ok) {
        return json({
          error: useWebSearch
            ? "Live web search is unavailable right now. No current answer was generated; please try again shortly."
            : "The AI provider returned an error. Please try again."
        }, 502, origin, allowed);
      }
      const data = await completion.json();
      const answerMessage = data.choices?.[0]?.message;
      const answer = answerMessage?.content;
      if (!answer) return json({ error: "No answer was returned." }, 502, origin, allowed);
      const citations = Array.isArray(answerMessage.annotations)
        ? answerMessage.annotations
            .filter(item => item?.type === "url_citation" && /^https:\/\//i.test(item.url_citation?.url || ""))
            .map(item => ({
              title: String(item.url_citation.title || item.url_citation.url).slice(0, 180),
              url: item.url_citation.url
            }))
            .filter((item, index, all) => all.findIndex(other => other.url === item.url) === index)
            .slice(0, 6)
        : [];
      return json({ reply: answer, citations, searched: useWebSearch }, 200, origin, allowed);
    } catch (e) {
      return json({ error: "Unable to process that message. Please try again." }, 500, origin, allowed);
    }
  }
};
function shouldUseWebSearch(messages) {
  const latestUser = [...messages].reverse().find(message => message.role === "user")?.content || "";
  return /\b(latest|newest|current|currently|today|tonight|tomorrow|yesterday|recent|upcoming|next|this week|this month|this year|release date|schedule|roadmap|price right now|as of now|is it out|has .* released)\b/i.test(latestUser);
}
function cors(origin, allowed) {
  return { "Access-Control-Allow-Origin": allowed === "*" ? "*" : origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
}
function json(data, status, origin, allowed) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(origin, allowed) } });
}
