// Diamond Support — browser-aware troubleshooting assistant.
// Captures a bounded sample of browser errors to help diagnose user-reported problems.
// This does not grant repository, code-editing, or deployment access.
const diamondBrowserErrors=[];
function diamondSafeError(value){return String(value||'').replace(/https?:\\/\\/[^\\s?#]+(?:\\?[^\\s]*)?/g,'[URL]').replace(/(token|password|secret|apiKey|authorization)\\s*[:=]\\s*[^\\s,;]+/gi,'$1=[redacted]').slice(0,500);}
window.addEventListener('error',e=>{if(diamondBrowserErrors.length<8)diamondBrowserErrors.push(diamondSafeError((e.message||'Script error')+' ('+(e.filename||'')+':'+(e.lineno||0)+')'));});
window.addEventListener('unhandledrejection',e=>{if(diamondBrowserErrors.length<8)diamondBrowserErrors.push(diamondSafeError('Unhandled promise: '+(e.reason?.message||e.reason||'unknown')));});
const DIAMOND_AI_ENDPOINT = "https://diamond-support-ai.jeffreygustave1.workers.dev";
const DIAMOND_SUPPORT_SYSTEM = `You are Diamond Support, the helpful technical support assistant for DIAMOND LOUNGE, a Discord-like community web app.

Your job is to troubleshoot issues step by step, not just give generic replies. When browser diagnostics are included, prioritize matching errors, explain their likely causes, and propose a focused fix. You still cannot change files or deploy code unless an actual tool grants that ability.
Website features include user accounts and profiles/avatar uploads, text channels and messages, direct messages, server creation/membership/roles/channels, voice chat, camera/video, screen sharing, voice-room watch activities, and premium cosmetics/entitlements.

Guidelines:
- Be conversational, calm, concise, and practical. Give one or two steps at a time, not giant lists.
- Ask clarifying questions only when needed. Identify what the user is experiencing, what they expected, and any error text.
- For troubleshooting, first isolate the problem: browser/device, reproduce steps, what works vs fails, and whether the issue affects one user or several.
- Offer concrete checks for browser permissions, refresh/relogin, browser compatibility, network, file type/size, and appropriate settings only when relevant.
- Explain likely causes in plain language and label guesses as possibilities.
- You cannot directly inspect the user's browser, database, server logs, Firestore, Cloudflare, account, or device unless a tool/integration explicitly provides that access. Never pretend you checked these or fixed something.
- Do not ask for passwords, authentication tokens, secret keys, payment details, or private information.
- If a likely site-side bug or backend/configuration issue is found, explain evidence and collect a concise report (feature, steps, expected vs actual, error, device/browser) for escalation to the DIAMOND LOUNGE developer.
- Current known limitation: Firebase Storage is not enabled on a paid billing plan; do not recommend upgrades or spending money. Use only free/no-cost troubleshooting alternatives unless user says otherwise.
- Keep answers focused on DIAMOND LOUNGE and don't invent features or access.`;
const view=document.getElementById("supportBotView"),openBtn=document.getElementById("supportBotOpen"),chat=document.getElementById("supportBotChat"),choices=document.getElementById("supportBotChoices"),reset=document.getElementById("supportBotReset"),form=document.getElementById("supportBotForm"),input=document.getElementById("supportBotInput"),sendButton=document.getElementById("supportBotSend");
const topics=["Account or login","Profile or avatar","Messages and DMs","Voice or microphone","Camera or video","Screen sharing","Servers or channels","Website bugs"];
let history=[],busy=false;
function bubble(text,kind="bot"){const row=document.createElement("div");row.className="support-bot-row "+(kind==="user"?"support-bot-user-row":"support-bot-assistant-row");const b=document.createElement("div");b.className="support-bot-message "+(kind==="user"?"support-bot-user-message":"support-bot-assistant-message");b.textContent=text;row.appendChild(b);chat.appendChild(row);chat.scrollTop=chat.scrollHeight;}
function topicButtons(){choices.replaceChildren();topics.forEach(topic=>{const b=document.createElement("button");b.type="button";b.textContent=topic;b.addEventListener("click",()=>send(topic));choices.appendChild(b);});}
async function send(message){const value=(message||"").trim();if(!value||busy)return;bubble(value,"user");history.push({role:"user",content:value});input.value="";busy=true;if(sendButton)sendButton.disabled=true;input.disabled=true;choices.replaceChildren();bubble("Diamond is investigating…","bot");const thinking=chat.lastElementChild;
try{if(DIAMOND_AI_ENDPOINT.includes("YOUR-WORKER-NAME"))throw new Error("Support backend endpoint is not configured.");const response=await fetch(DIAMOND_AI_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history.map((m,i)=>i===0&&m.role==="user"?{...m,content:DIAMOND_SUPPORT_SYSTEM+"\n\nUser question: "+m.content}:m)})});let data={};try{data=await response.json();}catch{}if(!response.ok)throw new Error("Support service returned HTTP "+response.status+(data.error?": "+String(data.error).slice(0,240):""));thinking?.remove();const answer=String(data.reply||"The support service returned an empty reply. Please try again.");history.push({role:"assistant",content:answer});bubble(answer,"bot");}
catch(error){thinking?.remove();bubble("I couldn't reach the support service just now. "+(error?.message||"Request failed.")+" Your issue hasn't been diagnosed yet. Please try sending your message again in a moment. If it continues, tell the developer that Diamond Support's endpoint is failing.","bot");}
finally{busy=false;input.disabled=false;if(sendButton)sendButton.disabled=false;topicButtons();input.focus();}}
function start(){chat.replaceChildren();history=[];bubble("Hi! I'm Diamond Support 💎. Tell me what isn't working and I'll help troubleshoot it step by step. What happened?","bot");topicButtons();input.value="";}
form?.addEventListener("submit",e=>{e.preventDefault();send(input.value);});
function openSupportConversation(){const area=document.querySelector(".chat-area");if(!area||!view)return;area.querySelectorAll(":scope > section").forEach(section=>{section.hidden=true;});view.hidden=false;const channelsSidebar=document.getElementById("channelsSidebar");if(channelsSidebar)channelsSidebar.hidden=false;const dmSidebar=document.getElementById("dmSidebar");if(dmSidebar)dmSidebar.hidden=false;const loungeSidebar=document.getElementById("loungeSidebar");if(loungeSidebar)loungeSidebar.hidden=true;const dmHomeButton=document.getElementById("dmHomeButton");if(dmHomeButton){dmHomeButton.classList.add("selected");dmHomeButton.setAttribute("aria-pressed","true");}const mainServerButton=document.getElementById("mainServerButton");if(mainServerButton){mainServerButton.classList.remove("selected");mainServerButton.setAttribute("aria-pressed","false");}document.body.classList.add("dm-mode");start();input.focus();}
function closeSupportConversation(){if(!view)return;view.hidden=true;const home=document.getElementById("dmHomeView");if(home)home.hidden=false;}
openBtn?.addEventListener("click",()=>{if(view&&!view.hidden){closeSupportConversation();return;}openSupportConversation();});
reset?.addEventListener("click",start);
