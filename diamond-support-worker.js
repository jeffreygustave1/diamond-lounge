// Diamond Lounge AI agent backend.
// Required Worker secret: OPENAI_API_KEY
// Optional Worker vars: AI_MODEL, REASONING_EFFORT, ALLOWED_ORIGIN
const SYSTEM_PROMPT = `You are Diamond Support: an intelligent, capable agent inside Diamond Lounge, not just a web-search interface or narrow tech-support bot.
Think carefully and use your knowledge to answer, reason, solve, teach, analyze, code, write, plan, compare, brainstorm, and troubleshoot. Understand intent and context; handle multi-turn follow-ups and use conversation history. Don't ask the user to repeat information already in the chat.
Use the calculator tool for arithmetic or mathematical evaluation rather than mental estimates when precision matters. You may combine tools in multiple steps before responding.\nChoose tools thoughtfully: use web_search for current/volatile information, fact-checking, source-backed research, or when explicitly requested; don't search reflexively for stable facts, creative tasks, or reasoning you can perform directly. When searching, synthesize rather than dump results, prioritize authoritative sources, cite sources, and distinguish verified facts from estimates, opinions, and uncertainty. If the answer may have changed and you cannot verify it, say so.
Use get_live_diamond_context only when app-session details are relevant (voice, camera, sharing, current view, network, or browser errors). Its read-only snapshot is limited to supplied fields; never imply you can see the user's screen or private content beyond those fields.
The current server UTC time is {{SERVER_TIME}}. Use supplied client timezone for local time answers.
For app troubleshooting and code audits, use supplied repository excerpts as evidence, accurately report coverage, and never invent tests or access. If source context is insufficient, explain exactly what would resolve it.
Do not request passwords, verification codes, payment details, or private messages. Do not take destructive, account-changing, or external actions without explicit user approval.
Diamond Lounge has exactly three primary columns: server rail, contextual sidebar, and main chat/content area. Never suggest a fourth column.
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
    if (!env.OPENAI_API_KEY) return json({ error: "AI service is not configured yet." }, 503, origin, allowed);

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
      if (!messages.length || messages.some(m => !m || !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" || m.content.length > 4000)) {
        return json({ error: "Invalid message history." }, 400, origin, allowed);
      }

      const clientTime = sanitizeClientTime(body.client_time);
      const appContext = sanitizeAppContext(body.app_context);
      const instructions = SYSTEM_PROMPT.replace("{{SERVER_TIME}}", new Date().toISOString()) +
        "\nClient time context: " + (clientTime ? JSON.stringify(clientTime) : "not supplied") +
        "\nA live app context tool is " + (appContext ? "available for this request." : "not available for this request.");

      const model = env.AI_MODEL || "gpt-6.2-astra";
      const effort = ["low", "medium", "high", "xhigh"].includes(env.REASONING_EFFORT)
        ? env.REASONING_EFFORT : "medium";
      const tools = [{ type: "web_search", search_context_size: "medium" }, LIVE_CONTEXT_TOOL, CALCULATOR_TOOL];

      let input = messages;
      let responseData = await createResponse(env, { model, effort, instructions, input, tools });
      const toolsUsed = new Set();

      for (let turn = 0; turn < 5; turn++) {
        const calls = Array.isArray(responseData.output)
          ? responseData.output.filter(item => item.type === "function_call") : [];
        if (!calls.length) break;

        input = [...input, ...responseData.output];
        const outputs = calls.map(call => {
          if (call.name === "calculate") {
            toolsUsed.add(call.name);
            let result;
            try {
              const args = JSON.parse(call.arguments || "{}");
              result = safeCalculate(args.expression);
            } catch (e) {
              result = { error: String(e.message || "Invalid calculation").slice(0, 180) };
            }
            return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) };
          }
          if (call.name === "get_live_diamond_context") {
            toolsUsed.add(call.name);
            return {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(appContext || {
                available: false,
                reason: "No current Diamond Lounge session snapshot was supplied."
              })
            };
          }
          return {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: "Tool not available." })
          };
        });
        input = [...input, ...outputs];
        responseData = await createResponse(env, { model, effort, instructions, input, tools });
      }

      const answer = extractOutputText(responseData);
      if (!answer) return json({ error: "The AI returned no text answer." }, 502, origin, allowed);
      const citations = extractCitations(responseData);
      const searched = Array.isArray(responseData.output) &&
        responseData.output.some(item => item.type === "web_search_call");
      if (searched) toolsUsed.add("web_search");

      return json({ reply: answer, citations, searched, tools_used: [...toolsUsed] }, 200, origin, allowed);
    } catch (error) {
      console.error("Diamond Support request failed:", error);
      return json({ error: "Diamond Support couldn't complete that request. Please try again." }, 500, origin, allowed);
    }
  }
};

async function createResponse(env, { model, effort, instructions, input, tools }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      reasoning: { effort },
      instructions,
      input,
      tools,
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      store: false,
      max_output_tokens: 1400
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("OpenAI Responses API error:", response.status, data.error?.code || data.error?.type || "unknown");
    throw new Error("AI provider returned HTTP " + response.status);
  }
  return data;
}

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
