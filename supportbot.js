// Diamond Support — browser-aware troubleshooting assistant.
// Captures a bounded sample of browser errors to help diagnose user-reported problems.
// Adds source context and presents AI-generated repair proposals for owner review and PR submission.
const diamondBrowserErrors=[];
function diamondSafeError(value){return String(value||'').replace(/https?:\/\/[^\s?#]+(?:\?[^\s]*)?/g,'[URL]').replace(/(token|password|secret|apiKey|authorization)\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]').slice(0,500);}
window.addEventListener('error',e=>{if(diamondBrowserErrors.length<8)diamondBrowserErrors.push(diamondSafeError((e.message||'Script error')+' ('+(e.filename||'')+':'+(e.lineno||0)+')'));});
window.addEventListener('unhandledrejection',e=>{if(diamondBrowserErrors.length<8)diamondBrowserErrors.push(diamondSafeError('Unhandled promise: '+(e.reason?.message||e.reason||'unknown')));});
const DIAMOND_AI_ENDPOINT = "https://diamond-support-ai.jeffreygustave1.workers.dev";
const DIAMOND_REPAIR_BRIDGE_ENDPOINT = "https://diamond-support-github-bridge.jeffreygustave1.workers.dev";
const DIAMOND_REPAIR_PATHS = new Set(["dashboard.html","supportbot.js","supportbot.css","style.css","dm.css","voice.js","watch.js","server.js","channels.js","dm.js","profile.js","calls.js","activities.js","README.md" ]);
import { auth } from "./firebase.js";
const DIAMOND_SUPPORT_SYSTEM = `You are Diamond Support AI, a code-aware diagnostic and repair-proposal agent for DIAMOND LOUNGE.

Analyze supplied repository excerpts and browser diagnostics before answering. Cross-reference files/functions where possible. For scan requests, inspect the supplied files for mismatched DOM IDs, event wiring, imports, undefined symbols, async/error handling, Firebase permission/data mismatches, UI state bugs, and security risks. Treat the repository snapshot status report as authoritative about which files were retrieved, failed, omitted, or truncated; never describe the snapshot as comprehensive when files are missing or truncated. Explain the coverage limits.

Evidence rules:
- Separate CONFIRMED findings (directly evidenced by supplied source or diagnostics) from POSSIBLE risks (not demonstrated).
- For every finding, name the file and function/section, explain evidence and impact, and suggest verification. Never invent tests or claim live scan, deployment, backend access, or runtime verification you did not perform.
- A partial snapshot is not the entire repository. State files supplied and coverage limits.
- Prioritize by severity and confidence; don't pad reports with speculative problems.
- If requested and source supports a concrete fix, prepare complete replacement contents for affected file(s), not snippets. Keep changes focused and preserve unrelated functionality. Only approved paths.
- Repair proposal output must be ONLY valid JSON (no Markdown fences or text) using schema: {"repair":true,"title":"short title","summary":"evidence and fix summary","files":[{"path":"approved repository path","content":"complete file contents"}]}. Maximum 6 files. If no evidence-backed repair is justified, answer in prose and do not emit a proposal.
- Never include credentials, tokens, secrets, or personal data in proposals. Do not ask for secrets.
- Do not create changes, commit, merge, or deploy without explicit approval and authorized tools.
- Keep answers practical and concise; ask clarification only when necessary.
Website includes profiles, messages/DMs, servers/channels, voice, video, screensharing, activities and entitlements. Firebase Storage has a free-plan limitation; don't recommend paid upgrades.`;
const view=document.getElementById("supportBotView"),openBtn=document.getElementById("supportBotOpen"),chat=document.getElementById("supportBotChat"),choices=document.getElementById("supportBotChoices"),reset=document.getElementById("supportBotReset"),form=document.getElementById("supportBotForm"),input=document.getElementById("supportBotInput"),sendButton=document.getElementById("supportBotSend");
const topics=["Account or login","Profile or avatar","Messages and DMs","Voice or microphone","Camera or video","Screen sharing","Servers or channels","Website bugs"];
let history=[],busy=false,projectSnapshotPromise=null;
async function getProjectSnapshot(){if(projectSnapshotPromise)return projectSnapshotPromise;projectSnapshotPromise=(async()=>{try{const tr=await fetch('https://api.github.com/repos/jeffreygustave1/diamond-lounge/git/trees/main?recursive=1');if(!tr.ok)return 'Repository context unavailable.';const tree=await tr.json(),targets=['dashboard.html','supportbot.js','supportbot.css','style.css','dm.css','voice.js','watch.js','firebase.js','firestore.rules','server.js','channels.js','dm.js','profile.js','calls.js','activities.js','README.md'];let total=0,parts=[];for(const path of targets){if(!tree.tree?.some(x=>x.path===path&&x.type==='blob'))continue;try{const res=await fetch('https://raw.githubusercontent.com/jeffreygustave1/diamond-lounge/main/'+path);if(!res.ok)continue;const src=(await res.text()).slice(0,7000);if(total+src.length>45000)break;total+=src.length;parts.push('\\n--- '+path+' ---\\n'+src);}catch{}}return parts.length?'Read-only repository source excerpts (possibly truncated):\\n'+parts.join('\\n'):'Could not retrieve project source files.';}catch{return 'Repository context unavailable.';}})();return projectSnapshotPromise;}
function bubble(text,kind="bot"){const row=document.createElement("div");row.className="support-bot-row "+(kind==="user"?"support-bot-user-row":"support-bot-assistant-row");const b=document.createElement("div");b.className="support-bot-message "+(kind==="user"?"support-bot-user-message":"support-bot-assistant-message");b.textContent=text;row.appendChild(b);chat.appendChild(row);chat.scrollTop=chat.scrollHeight;}
function proposalCard(proposal){
  if(!proposal||proposal.repair!==true||!Array.isArray(proposal.files)||proposal.files.length<1||proposal.files.length>6)return false;
  const files=proposal.files.filter(f=>f&&DIAMOND_REPAIR_PATHS.has(f.path)&&typeof f.content==="string"&&f.content.trim());
  if(files.length!==proposal.files.length)return false;
  const wrap=document.createElement("section");wrap.className="support-repair-proposal";
  const h=document.createElement("h3");h.textContent=proposal.title||"Repair proposal";wrap.append(h);
  const summary=document.createElement("p");summary.textContent=proposal.summary||"Review the proposed changes.";wrap.append(summary);
  const list=document.createElement("ul");files.forEach(f=>{const li=document.createElement("li");li.textContent=f.path;list.append(li)});wrap.append(list);
  const review=document.createElement("details");const summaryLabel=document.createElement("summary");summaryLabel.textContent="Review complete proposed file contents";review.append(summaryLabel);
  files.forEach(f=>{const box=document.createElement("div");box.className="support-repair-file";const label=document.createElement("h4");label.textContent=f.path;const pre=document.createElement("pre");pre.textContent=f.content;box.append(label,pre);review.append(box)});wrap.append(review);
  const submit=document.createElement("button");submit.type="button";submit.textContent="Create GitHub pull request";submit.disabled=DIAMOND_REPAIR_BRIDGE_ENDPOINT.includes("YOUR-REPAIR-BRIDGE");submit.title=submit.disabled?"Repair bridge must be deployed and its URL configured in supportbot.js":"";
  submit.addEventListener("click",async()=>{if(submit.disabled)return;submit.disabled=true;submit.textContent="Submitting…";try{const user=auth.currentUser;if(!user)throw new Error("Please sign in again.");const token=await user.getIdToken();const res=await fetch(DIAMOND_REPAIR_BRIDGE_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({title:proposal.title,summary:proposal.summary,files})});const data=await res.json().catch(()=>({}));if(!res.ok||!data.ok)throw new Error(data.error||"Bridge rejected the request.");const link=document.createElement("a");link.href=data.pr_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open pull request";wrap.append(link);submit.textContent="Pull request created";}catch(e){const err=document.createElement("p");err.textContent="Submission failed: "+(e.message||String(e));wrap.append(err);submit.disabled=false;submit.textContent="Retry pull request";}});wrap.append(submit);
  chat.append(wrap);chat.scrollTop=chat.scrollHeight;return true;
}
function parseRepairAnswer(answer){
 try{
  let raw=answer.trim();
  raw=raw.replace(/^\s*\x60\x60\x60(?:json)?\s*/i,"");
  raw=raw.replace(/\s*\x60\x60\x60$/,"");
  const parsed=JSON.parse(raw);
  if(proposalCard(parsed)){
   return "Repair proposal prepared for review. The complete proposed files are displayed below; no changes have been applied.";
  }
 }catch(error){}
 return answer;
}
function topicButtons(){choices.replaceChildren();topics.forEach(topic=>{const b=document.createElement("button");b.type="button";b.textContent=topic;b.addEventListener("click",()=>send(topic));choices.appendChild(b);});}
async function send(message){
 const value=(message||"").trim();
 if(!value||busy)return;
 bubble(value,"user");
 history.push({role:"user",content:value});
 input.value="";
 busy=true;
 if(sendButton)sendButton.disabled=true;
 input.disabled=true;
 choices.replaceChildren();
 bubble("Diamond is investigating…","bot");
 const thinking=chat.lastElementChild;
 try{
  const snapshot=await getProjectSnapshot();
  const original=history[0].content;
  const prefix=DIAMOND_SUPPORT_SYSTEM+"\n\nRecent browser errors (if any): ";
  const errorText=diamondBrowserErrors.length?diamondBrowserErrors.join("\n"):"No captured browser errors.";
  const enriched=prefix+errorText+"\n\n"+snapshot+"\n\nUser question: "+original;
  const messages=[];
  for(let i=0;i<history.length;i++){
   if(i===0)messages.push({role:"user",content:enriched});
   else messages.push(history[i]);
  }
  const response=await fetch(DIAMOND_AI_ENDPOINT,{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({messages:messages})
  });
  let data={};
  try{data=await response.json();}catch(error){}
  if(!response.ok){
   let detail=data.error?": "+String(data.error).slice(0,240):"";
   throw new Error("Support service returned HTTP "+response.status+detail);
  }
  thinking.remove();
  const rawAnswer=String(data.reply||"The support service returned an empty reply. Please try again.");
  const answer=parseRepairAnswer(rawAnswer);
  bubble(answer,"bot");
  history.push({role:"assistant",content:rawAnswer});
 }catch(error){
  thinking.remove();
  bubble("I couldn't reach the support service just now. "+(error.message||"Request failed.")+" Your issue hasn't been diagnosed yet. Please try sending your message again in a moment.","bot");
 }finally{
  busy=false;
  input.disabled=false;
  if(sendButton)sendButton.disabled=false;
  topicButtons();
  input.focus();
 }
}

function start(){chat.replaceChildren();history=[];bubble("Hi! I'm Diamond Support 💎. Tell me what isn't working and I'll help troubleshoot it step by step. What happened?","bot");topicButtons();input.value="";}
form?.addEventListener("submit",e=>{e.preventDefault();send(input.value);});
function openSupportConversation(){const area=document.querySelector(".chat-area");if(!area||!view)return;area.querySelectorAll(":scope > section").forEach(section=>{section.hidden=true;});view.hidden=false;const channelsSidebar=document.getElementById("channelsSidebar");if(channelsSidebar)channelsSidebar.hidden=false;const dmSidebar=document.getElementById("dmSidebar");if(dmSidebar)dmSidebar.hidden=false;const loungeSidebar=document.getElementById("loungeSidebar");if(loungeSidebar)loungeSidebar.hidden=true;const dmHomeButton=document.getElementById("dmHomeButton");if(dmHomeButton){dmHomeButton.classList.add("selected");dmHomeButton.setAttribute("aria-pressed","true");}const mainServerButton=document.getElementById("mainServerButton");if(mainServerButton){mainServerButton.classList.remove("selected");mainServerButton.setAttribute("aria-pressed","false");}document.body.classList.add("dm-mode");start();input.focus();}
function closeSupportConversation(){if(!view)return;view.hidden=true;const home=document.getElementById("dmHomeView");if(home)home.hidden=false;}
openBtn?.addEventListener("click",()=>{if(view&&!view.hidden){closeSupportConversation();return;}openSupportConversation();});
reset?.addEventListener("click",start);
