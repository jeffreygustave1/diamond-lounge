// Diamond Support — browser-aware troubleshooting assistant.
// Captures a bounded sample of browser errors to help diagnose user-reported problems.
// Adds source context and presents AI-generated repair proposals for owner review and PR submission.
const diamondBrowserErrors=[];
function diamondSafeError(value){return String(value||'').replace(/https?:\/\/[^\s?#]+(?:\?[^\s]*)?/g,'[URL]').replace(/(token|password|secret|apiKey|authorization)\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]').slice(0,500);}
window.addEventListener('error',e=>{if(diamondBrowserErrors.length<8)diamondBrowserErrors.push(diamondSafeError((e.message||'Script error')+' ('+(e.filename||'')+':'+(e.lineno||0)+')'));});
window.addEventListener('unhandledrejection',e=>{if(diamondBrowserErrors.length<8)diamondBrowserErrors.push(diamondSafeError('Unhandled promise: '+(e.reason?.message||e.reason||'unknown')));});
const DIAMOND_AI_ENDPOINT = "https://diamond-support-ai.jeffreygustave1.workers.dev";
const DIAMOND_REPAIR_BRIDGE_ENDPOINT = "https://diamond-support-github-bridge.jeffreygustave1.workers.dev";
const DIAMOND_REPAIR_PATHS = new Set([
  "dashboard.html","firebase.js","script.js","voice.js","dm-call.js","watch-feature.js","media.js",
  "voice-sounds.js","watchdog.js","supportbot.js","supportbot.css","style.css","luxury.css",
  "branding-polish.css","brand.css","dm.css","dm-call.css","firestore.rules","storage.rules",
  "diamond-support-worker.js","diamond-support-github-bridge.js","README.md"
]);
import { auth } from "./firebase.js";
const DIAMOND_GENERAL_SYSTEM = `You are Diamond Support, a helpful general-purpose assistant inside Diamond Lounge.
Answer the user's actual question, even when it is unrelated to Diamond Lounge. Never deflect to app troubleshooting just because a question is about another game, product, company, or topic.
For current or time-sensitive questions, use available live-search results, cite the sources, prioritize official sources, and clearly distinguish confirmed information from speculation. If no confirmed date exists, say so.
Be friendly, direct, and concise. `;
const DIAMOND_SUPPORT_SYSTEM = `You are Diamond Support AI, a code-aware diagnostic and repair-proposal agent for DIAMOND LOUNGE.

Analyze supplied repository excerpts and browser diagnostics before answering. Cross-reference files/functions where possible. For scan requests, inspect the supplied files for mismatched DOM IDs, event wiring, imports, undefined symbols, async/error handling, Firebase permission/data mismatches, UI state bugs, and security risks. Treat the repository snapshot status report as authoritative about which files were retrieved, failed, omitted, or truncated; never describe the snapshot as comprehensive when files are missing or truncated. Explain the coverage limits.

Evidence rules:
- Separate CONFIRMED findings (directly evidenced by supplied source or diagnostics) from POSSIBLE risks (not demonstrated).
- For every finding, name the file and function/section, explain evidence and impact, and suggest verification. Never invent tests or claim live scan, deployment, backend access, or runtime verification you did not perform.
- A partial snapshot is not the entire repository. State files supplied and coverage limits.
Retrieval transparency: The repository manifest and supplied supportbot.js source are ordinary application source, not hidden model internals. When asked about retrieval mechanics, report only details visible in those sources (real target paths, sample caps, and message limits). Do not claim you cannot inspect source code included in the request. Never reveal credentials, secrets, or hidden model prompts.
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
async function getProjectSnapshot(focus=""){
 if(projectSnapshotPromise)return projectSnapshotPromise;
 projectSnapshotPromise=(async()=>{
  try{
   const tr=await fetch("https://api.github.com/repos/jeffreygustave1/diamond-lounge/git/trees/main?recursive=1");
   if(!tr.ok)return {manifest:"Repository tree unavailable (HTTP "+tr.status+").",chunks:[]};
   const tree=await tr.json();
   const entries=Array.isArray(tree.tree)?tree.tree:[];
   const files=new Set(entries.filter(x=>x.type==="blob").map(x=>x.path));
   const styleRequest=/(css|style|layout|appearance|visual|spacing|color|font)/i.test(focus);
   const watchRequest=/(watch|youtube|media|video activity)/i.test(focus);
   let targets;
   if(styleRequest){
    targets=["dashboard.html","style.css","luxury.css","branding-polish.css","brand.css","dm.css","dm-call.css","supportbot.css","script.js","firebase.js"];
   }else if(watchRequest){
    targets=["dashboard.html","firebase.js","script.js","voice.js","watch-feature.js","media.js","voice-sounds.js","firestore.rules","storage.rules","supportbot.js"];
   }else{
    targets=["dashboard.html","firebase.js","script.js","voice.js","dm-call.js","firestore.rules","storage.rules","supportbot.js","diamond-support-worker.js","diamond-support-github-bridge.js"];
   }
   const manifest=[],chunks=[];
   const MAX_SAMPLE=2100,MAX_INDEX=650;
   function sampleSource(path,full){
    if(path==="supportbot.js"){
     const pieces=[];
     const add=(label,anchor,max)=>{
      const at=full.indexOf(anchor);
      if(at>=0)pieces.push("### "+label+"\n"+full.slice(at,at+max));
     };
     add("Repair paths","const DIAMOND_REPAIR_PATHS",500);
     add("Snapshot retrieval implementation","async function getProjectSnapshot",1800);
     add("Message construction","async function send(message)",1050);
     return {sample:pieces.join("\n...[section omitted]...\n"),index:""};
    }
    if(full.length<=MAX_SAMPLE)return {sample:full,index:""};
    const head=Math.floor(MAX_SAMPLE*.38),mid=Math.floor(MAX_SAMPLE*.24),tail=MAX_SAMPLE-head-mid;
    const midStart=Math.max(head,Math.floor((full.length-mid)/2));
    const tailStart=Math.max(midStart+mid,full.length-tail);
    const sample=full.slice(0,head)+"\n...[middle omitted]...\n"+full.slice(midStart,midStart+mid)+"\n...[end excerpt]...\n"+full.slice(tailStart);
    let index="";
    if(/\.js$/i.test(path)){
     const names=[];
     const lines=full.split("\n");
     for(let i=0;i<lines.length;i++){
      const m=lines[i].match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
      if(m)names.push((i+1)+":"+m[1]);
     }
     if(names.length)index="Function index (source line numbers): "+names.slice(0,24).join(", ")+(names.length>24?" … ("+names.length+" total)":"");
     if(index.length>MAX_INDEX)index=index.slice(0,MAX_INDEX)+"…";
    }
    return {sample,index};
   }
   for(const path of targets){
    if(!files.has(path)){manifest.push(path+": NOT PRESENT in repository tree");continue;}
    try{
     const res=await fetch("https://raw.githubusercontent.com/jeffreygustave1/diamond-lounge/main/"+path);
     if(!res.ok){manifest.push(path+": FETCH FAILED HTTP "+res.status);continue;}
     const full=await res.text();
     const picked=sampleSource(path,full);
     const excerpt=picked.sample+(picked.index?"\n\n"+picked.index:"");
     const complete=full.length<=MAX_SAMPLE;
     manifest.push(path+": fetched "+full.length+" chars; sent "+excerpt.length+" chars ("+(complete?"COMPLETE":"SAMPLED; omitted source is not analyzed")+")");
     chunks.push("REPOSITORY SOURCE: "+path+"\n"+excerpt);
    }catch(e){manifest.push(path+": FETCH ERROR "+String(e).slice(0,120));}
   }
   const extra=entries.filter(x=>x.type==="blob"&&/\.(js|css|html|rules)$/i.test(x.path)&&!targets.includes(x.path)).map(x=>x.path);
   manifest.push("Other source files present but not sampled: "+(extra.slice(0,24).join(", ")||"none")+(extra.length>24?" … ("+extra.length+" total)":""));
   manifest.push("Sampling/request limits: per-file excerpt up to 2100 chars plus a JavaScript function index up to 650 chars; up to 10 source excerpts; at most 16 messages total; each client message capped at 3800 chars to stay below the Worker 4000-char message validator.");
   manifest.push("The live app entry points visible in dashboard.html are script.js, watch-feature.js, supportbot.js, dm-call.js, voice.js, and watchdog.js. Main application features are consolidated in script.js; separate server.js/channels.js/dm.js/calls.js/profile.js files are not part of this repository tree.");
   return {manifest:"REPOSITORY RETRIEVAL STATUS (each source excerpt is a separate message):\n"+manifest.join("\n"),chunks};
  }catch(e){return {manifest:"Repository context unavailable: "+String(e).slice(0,180),chunks:[]};}
 })();
 try{return await projectSnapshotPromise;}finally{projectSnapshotPromise=null;}
}
function bubble(text,kind="bot",sources=[]){
 const row=document.createElement("div");
 row.className="support-bot-row "+(kind==="user"?"support-bot-user-row":"support-bot-assistant-row");
 const stack=document.createElement("div");stack.className="support-bot-message-stack";
 const b=document.createElement("div");
 b.className="support-bot-message "+(kind==="user"?"support-bot-user-message":"support-bot-assistant-message");
 b.textContent=text;stack.appendChild(b);
 if(kind!=="user"&&Array.isArray(sources)&&sources.length){
  const wrap=document.createElement("div");wrap.className="support-bot-sources";
  const label=document.createElement("span");label.textContent="Sources";wrap.appendChild(label);
  sources.forEach(source=>{
   if(!source||typeof source.url!=="string")return;
   try{const url=new URL(source.url);if(url.protocol!=="https:")return;
    const link=document.createElement("a");link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";
    link.textContent=String(source.title||url.hostname).slice(0,180);wrap.appendChild(link);
   }catch{}
  });
  if(wrap.querySelector("a"))stack.appendChild(wrap);
 }
 row.appendChild(stack);chat.appendChild(row);chat.scrollTop=chat.scrollHeight;
}
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
function isDiamondLoungeRequest(message){
 return /\b(diamond lounge|website|web site|dashboard|login|log in|account|profile|avatar|messages|direct message|\bdm\b|voice|microphone|camera|screen share|screen sharing|server|channel|firebase|firestore|support bot|supportbot|code|bug|error|crash|repair|audit|worker|app)\b/i.test(String(message||""));
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
  const appRequest=isDiamondLoungeRequest(value);
  const snapshot=appRequest
   ? await getProjectSnapshot(value)
   : {manifest:"General question: repository source was intentionally not included.",chunks:[]};
  const errorText=diamondBrowserErrors.length?diamondBrowserErrors.join("\n").slice(0,650):"No captured browser errors.";
  const currentPrompt=appRequest
   ? DIAMOND_SUPPORT_SYSTEM+"\n\nInitial user request: "+(history[0]?.content||value).slice(0,650)+"\n\nRecent browser diagnostics (bounded):\n"+errorText
   : DIAMOND_GENERAL_SYSTEM+"\n\nUser question: "+value;
  const messages=[{role:"user",content:currentPrompt.slice(0,3800)}];
  if(appRequest){
   messages.push({role:"user",content:snapshot.manifest.slice(0,3800)});
   for(const chunk of snapshot.chunks.slice(0,10))messages.push({role:"user",content:chunk.slice(0,3800)});
  }
  const recent=history.slice(1).slice(-4).map(m=>({role:m.role,content:String(m.content||"").slice(0,1500)}));
  messages.push(...recent);
  const response=await fetch(DIAMOND_AI_ENDPOINT,{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({messages:messages.slice(-16)})
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
  bubble(answer,"bot",data.citations||[]);
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
