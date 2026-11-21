// Diamond Lounge AI agent backend.
// Required Worker secret: OPENAI_API_KEY
// Optional Worker vars: AI_MODEL, REASONING_EFFORT, ALLOWED_ORIGIN
const SYSTEM_PROMPT = `You are Diamond Support: an intelligent, capable agent inside Diamond Lounge, not just a web-search interface or narrow tech-support bot.
Think carefully and use your knowledge to answer, reason, solve, teach, analyze, code, write, plan, compare, brainstorm, and troubleshoot. Understand intent and context; handle multi-turn follow-ups and use conversation history. Don't ask the user to repeat information already in the chat.
Calculation reliability: For numerical tasks involving tax, budgets, percentages, totals, comparisons, or multiple arithmetic steps, call calculate for each important calculation and cross-check the result against the stated inputs before finalizing. Never invent calculated values.\nResearch integrity: For live research, use web_search if available and provide citations or clickable source URLs for factual price, availability, policy, patch/news, or other volatile claims. This version has no live-search tool attached. Do not claim you searched, researched, verified, or found current prices unless the tool actually ran and relevant evidence is present. If search evidence is unavailable, clearly label information as estimates or unverified.\nCompletion quality: Before sending, check that you answered all parts of the request, that tables and lists are complete, that calculations agree, and that you have not left a sentence or section unfinished. If the output is incomplete, continue generating a complete answer rather than presenting a partial one. Use the calculator tool for arithmetic or mathematical evaluation rather than mental estimates when precision matters. You may combine tools in multiple steps before responding.\nLIVE-SEARCH ENFORCEMENT: For requests asking what is latest, newest, current, today, right now, live, recent, or for current patch/hotfix/release/news/version/pricing/availability/schedule/status, perform live web search if available. This version does not have a search tool, so clearly disclose that and never present memory as current verification. Prefer official sources for the subject (for Star Citizen: RSI patch notes, Comm-Link, official announcements). Summarize the retrieved evidence, provide source URLs, and state the date/time context where useful. Never answer a current-status question from memory alone. If live search yields no relevant results, clearly disclose that and do not substitute stale knowledge as current.\nChoose tools thoughtfully: use web_search for current/volatile information, fact-checking, source-backed research, or when explicitly requested; don't search reflexively for stable facts, creative tasks, or reasoning you can perform directly. When searching, synthesize rather than dump results, prioritize authoritative sources, cite sources, and distinguish verified facts from estimates, opinions, and uncertainty. If the answer may have changed and you cannot verify it, say so.
Use get_live_diamond_context only when app-session details are relevant (voice, camera, sharing, current view, network, or browser errors). Its read-only snapshot is limited to supplied fields; never imply you can see the user's screen or private content beyond those fields.
The current server UTC time is {{SERVER_TIME}}. Use supplied client timezone for local time answers.
For app troubleshooting and code audits, use supplied repository excerpts as evidence, accurately report coverage, and never invent tests or access. If source context is insufficient, explain exactly what would resolve it.
Do not request passwords, verification codes, payment details, or private messages. Do not take destructive, account-changing, or external actions without explicit user approval.
Diamond Lounge has exactly three primary columns: server rail, contextual sidebar, and main chat/content area. Never suggest a fourth column.
Execution and completion discipline: Treat requests to research, compare, calculate, find, plan, or investigate as tasks to complete in this response, not as work to promise for later. When a task is actionable and the needed tools are available, use them now and return the completed result. Do not write "one moment", "I'll now research", "I'll compile this", "wait while I", or similar progress-only statements as a substitute for execution. Do not ask the user to supply options you can independently discover unless their preferences or constraints are essential. If you cannot complete the task with available tools, clearly state the specific limitation and provide the most useful partial result instead; never imply that background work is continuing after the HTTP response ends. For market research or current comparisons, invoke web_search in this response, gather evidence, and cite sources in the answer; tool availability does not guarantee successful results, so be transparent.
Be resourceful and proactive about useful next steps, while remaining honest about limitations. Be conversational, concise, and clear. Ask at most one focused clarification when necessary.`;

const CALCULATOR_TOOL = {
  type: "function",
  name: "calculate",
  description: "Evaluate a mathematical expression safely. Supports arithmetic, parentheses, powers, constants pi/e, and common functions such as sqrt, abs, sin, cos, tan, log, ln, exp, min, max, round, floor and ceil. Use when calculations materially help.",
  strict: true,
  parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"], additionalProperties: false }
};

const LIVE_CONTEXT_TOOL = {
  type: "function",
  name: "get_live_diamond_context",
  description: "Read the limited current Diamond Lounge browser/session snapshot supplied with this request. Use only when the user's question depends on their current app, voice, camera, screen sharing, login state, or browser session.",
  strict: true,
  parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "https://diamond-lounge.pages.dev";
    if (request.method === "OPTIONS") {
      if (allowed !== "*" && origin !== allowed) return json({ error: "Origin not allowed." }, 403, origin, allowed);
      return new Response(null, { status: 204, headers: cors(origin, allowed) });
    }
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, origin, allowed);
    if (allowed !== "*" && origin !== allowed) return json({ error: "Origin not allowed." }, 403, origin, allowed);
    if (!env.AI) return json({ error: "Free AI is not configured. Add the Workers AI binding named AI in Cloudflare." }, 503, origin, allowed);

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
      if (!messages.length || messages.some(m => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 4000)) {
        return json({ error: "Invalid message history." }, 400, origin, allowed);
      }
      const clientTime = sanitizeClientTime(body.client_time);
      const instructions = SYSTEM_PROMPT.replace("{{SERVER_TIME}}", new Date().toISOString()) +
        "\nClient time context: " + (clientTime ? JSON.stringify(clientTime) : "not supplied") +
        "\nThe current app context snapshot is " + (sanitizeAppContext(body.app_context) ? "available but not passed to a tool in this version." : "not available.");
      const model = env.AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      const result = await env.AI.run(model, { messages: [{ role: "system", content: instructions }, ...messages], max_tokens: 1800 });
      const answer = typeof result?.response === "string" ? result.response.trim() : "";
      if (!answer) return json({ error: "The free AI model returned no text answer." }, 502, origin, allowed);
      return json({ reply: answer, citations: [], searched: false, tools_used: [], provider: "Cloudflare Workers AI" }, 200, origin, allowed);
    } catch (error) {
      console.error("Diamond Support free AI request failed:", error?.message || error);
      return json({ error: "Diamond Support's free AI service couldn't complete that request. Please try again." }, 500, origin, allowed);
    }
  }
};


function safeCalculate(expression) {
  if (typeof expression !== "string" || expression.length > 200) throw new Error("Expression too long or invalid.");
  const s = expression.replace(/\\s+/g, "").toLowerCase();
  if (!s) throw new Error("Empty expression.");
  let i = 0;
  const peek = () => s[i];
  const eat = ch => { if (s[i] === ch) { i++; return true; } return false; };
  const number = () => {
    const start = i; while (/[0-9.]/.test(s[i] || "")) i++;
    const n = Number(s.slice(start, i)); if (!Number.isFinite(n)) throw new Error("Invalid number."); return n;
  };
  const expr = () => add();
  const add = () => { let v = mul(); while (peek()==="+"||peek()==="-") { const op=s[i++]; const r=mul(); v=op==="+"?v+r:v-r; } return v; };
  const mul = () => { let v = power(); while (peek()==="*"||peek()==="/"||peek()==="%") { const op=s[i++]; const r=power(); if(op==="/"&&r===0)throw new Error("Division by zero."); v=op==="*"?v*r:op==="/"?v/r:v%r; } return v; };
  const power = () => { let v=unary(); if(eat("^")) v=Math.pow(v,power()); return v; };
  const unary = () => { if(eat("+"))return unary(); if(eat("-"))return -unary(); return atom(); };
  const atom = () => {
    if(eat("(")){const v=expr();if(!eat(")"))throw new Error("Missing closing parenthesis.");return v;}
    if(/[0-9.]/.test(peek()||""))return number();
    if(/[a-z]/.test(peek()||"")){
      const start=i;while(/[a-z]/.test(s[i]||""))i++;const name=s.slice(start,i);
      if(name==="pi")return Math.PI;if(name==="e")return Math.E;
      if(!eat("("))throw new Error("Unknown name: "+name);
      const args=[];if(peek()!==")"){args.push(expr());while(eat(","))args.push(expr());}if(!eat(")"))throw new Error("Missing function parenthesis.");
      const fn={sqrt:Math.sqrt,abs:Math.abs,sin:Math.sin,cos:Math.cos,tan:Math.tan,log:Math.log10,ln:Math.log,exp:Math.exp,round:Math.round,floor:Math.floor,ceil:Math.ceil,min:Math.min,max:Math.max};
      if(!fn[name])throw new Error("Unsupported function: "+name);
      if(["min","max"].includes(name)){if(args.length<1)throw new Error(name+" needs arguments.");return fn[name](...args);}
      if(args.length!==1)throw new Error(name+" takes one argument.");return fn[name](args[0]);
    }
    throw new Error("Unexpected token.");
  };
  const result=expr();if(i!==s.length)throw new Error("Unexpected characters in expression.");
  if(!Number.isFinite(result))throw new Error("Result is not finite.");
  return { expression, result };
}

function extractOutputText(response) {
  const parts = [];
  for (const item of response?.output || []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (block.type === "output_text" && typeof block.text === "string") parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function extractCitations(response) {
  const citations = [];
  for (const item of response?.output || []) {
    if (item.type !== "message") continue;
    for (const block of item.content || []) {
      for (const annotation of block.annotations || []) {
        const cite = annotation.url_citation;
        if (annotation.type !== "url_citation" || !/^https:\/\//i.test(cite?.url || "")) continue;
        citations.push({ title: String(cite.title || cite.url).slice(0, 180), url: cite.url });
      }
    }
  }
  return citations.filter((item, index, all) =>
    all.findIndex(other => other.url === item.url) === index
  ).slice(0, 8);
}

function sanitizeClientTime(value) {
  if (!value || typeof value !== "object") return null;
  return { captured_at: safeString(value.captured_at, 48), time_zone: safeString(value.time_zone, 80) };
}

function sanitizeAppContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const views = new Set(["supportBotView", "dmHomeView", "dmConversationView", "serverView", "loungeView", "emptyView", "unknown"]);
  const voice = value.voice && typeof value.voice === "object" ? value.voice : {};
  return {
    captured_at: safeString(value.captured_at, 48),
    signed_in: value.signed_in === true,
    anonymous_session: value.anonymous_session === true,
    current_view: views.has(value.current_view) ? value.current_view : "unknown",
    browser_online: value.browser_online === true,
    time_zone: safeString(value.time_zone, 80),
    voice: {
      connected: voice.connected === true,
      joining: voice.joining === true,
      muted: voice.muted === true,
      camera_on: voice.camera_on === true,
      screen_sharing: voice.screen_sharing === true,
      deafened: voice.deafened === true,
      raised_hand: voice.raised_hand === true,
      channel: safeString(voice.channel, 100),
      server: safeString(voice.server, 100),
      status: safeString(voice.status, 140),
      participant_count: safeString(voice.participant_count, 24)
    },
    recent_browser_errors: Array.isArray(value.recent_browser_errors)
      ? value.recent_browser_errors.slice(0, 8).map(item => safeString(item, 240)) : []
  };
}

function safeString(value, max) {
  return typeof value === "string" ? value.replace(/[\r\n\0]/g, " ").slice(0, max) : "";
}

function cors(origin, allowed) {
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, origin, allowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin, allowed) }
  });
}
