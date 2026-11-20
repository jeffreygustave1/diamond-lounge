/* Diamond Lounge Watch — voice-dock activity */
(function(){
const button=document.getElementById("diamondWatchButton");
if(!button)return;
const overlay=document.createElement("div");
overlay.className="dl-watch-overlay";
overlay.hidden=true;
overlay.innerHTML=`
<div class="dl-watch-shell" role="dialog" aria-modal="true" aria-label="Watch activities">
  <div class="dl-watch-top">
    <div class="dl-watch-brand"><img src="diamond.gif" alt=""><span>DIAMOND LOUNGE · WATCH</span></div>
    <div class="dl-watch-top-actions"><span class="dl-watch-live-label">VOICE ACTIVITY</span><button class="dl-watch-close" aria-label="Close Watch">×</button></div>
  </div>
  <div class="dl-watch-grid">
    <div class="dl-watch-main">
      <div class="dl-watch-player" id="dlWatchPlayer">
        <div class="dl-watch-empty"><span>◆</span><strong>YOUR WATCH LOUNGE</strong><small>Choose a video to get started</small></div>
        <div class="dl-watch-chat-glass" id="dlWatchChat"><div class="chat-label">LOUNGE CHAT</div><p><b>Diamond Lounge</b> <span class="chat-muted">Welcome to Watch.</span></p><p class="chat-muted">Chat overlay preview — live synchronized Watch chat is not connected yet.</p></div>
      </div>
      <div class="dl-watch-video-meta"><div><h2 class="dl-watch-title">Watch together</h2><p class="dl-watch-caption" id="dlWatchStatus">Your voice channel is connected. Load a YouTube video to begin.</p></div><button class="dl-watch-theater" id="dlWatchTheater" type="button">Theater mode</button></div>
    </div>
    <aside class="dl-watch-side">
      <h3>WATCH CONTROLS</h3>
      <label class="dl-watch-field-label" for="dlWatchUrl">VIDEO LINK</label>
      <input class="dl-watch-url" id="dlWatchUrl" type="url" placeholder="Paste a YouTube link…">
      <button class="dl-watch-load" id="dlWatchLoad">▶ Load video</button>
      <div class="dl-watch-option-group">
        <button type="button" id="dlWatchBrowse">⌕ <span><b>Browse YouTube</b><small>Find something to watch</small></span><i>↗</i></button>
        <button type="button" id="dlWatchInvite">♧ <span><b>Invite to Watch</b><small>Copy the video link</small></span><i>⧉</i></button>
        <button type="button" id="dlWatchChatToggle" aria-pressed="true">▤ <span><b>Show chat overlay</b><small>Toggle the glass chat panel</small></span><i>◉</i></button>
        <button type="button" id="dlWatchReload">↻ <span><b>Reload video</b><small>Restart the current player</small></span><i>↻</i></button>
        <button type="button" id="dlWatchClear">⌫ <span><b>Clear player</b><small>Remove the current video</small></span><i>×</i></button>
      </div>
      <p class="dl-watch-note">Video playback is embedded from YouTube. Synchronized playback and live Watch chat are planned separately.</p>
    </aside>
  </div>
</div>`;
document.body.append(overlay);
const $=id=>overlay.querySelector("#"+id);
const close=overlay.querySelector(".dl-watch-close"),input=$("dlWatchUrl"),player=$("dlWatchPlayer"),status=$("dlWatchStatus");
let currentId=null,currentUrl="";
function show(){overlay.hidden=false;close.focus();}
function hide(){overlay.hidden=true;}
function parseVideo(raw){
 try{
  const u=new URL(raw);
  if(u.hostname==="youtu.be")return u.pathname.slice(1);
  if(u.hostname==="youtube.com"||u.hostname.endsWith(".youtube.com"))return u.searchParams.get("v")||u.pathname.split("/").filter(Boolean).pop();
 }catch{}
 return null;
}
function clearPlayer(){
 player.querySelector("iframe")?.remove();
 currentId=null;currentUrl="";
 const empty=document.createElement("div");empty.className="dl-watch-empty";
 empty.innerHTML="<span>◆</span><strong>YOUR WATCH LOUNGE</strong><small>Choose a video to get started</small>";
 player.prepend(empty);status.textContent="Your voice channel is connected. Load a YouTube video to begin.";
}
function loadVideo(){
 const id=parseVideo(input.value.trim());
 if(!id||!/^[A-Za-z0-9_-]{6,}$/.test(id)){input.setCustomValidity("Please enter a valid YouTube link.");input.reportValidity();return;}
 input.setCustomValidity("");player.querySelector("iframe")?.remove();player.querySelector(".dl-watch-empty")?.remove();
 const iframe=document.createElement("iframe");
 iframe.src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)+"?autoplay=1&rel=0";
 iframe.title="YouTube video";iframe.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";iframe.allowFullscreen=true;
 player.prepend(iframe);currentId=id;currentUrl="https://www.youtube.com/watch?v="+id;
 status.textContent="Video loaded. Share its link with people in your voice channel.";
}
button.addEventListener("click",show);
close.addEventListener("click",hide);
overlay.addEventListener("click",e=>{if(e.target===overlay)hide();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)hide();});
$("dlWatchLoad").addEventListener("click",loadVideo);
input.addEventListener("keydown",e=>{if(e.key==="Enter")loadVideo();});
$("dlWatchBrowse").addEventListener("click",()=>window.open("https://www.youtube.com/","_blank","noopener,noreferrer"));
$("dlWatchInvite").addEventListener("click",async()=>{
 if(!currentUrl){status.textContent="Load a video first, then you can copy its link.";return;}
 try{await navigator.clipboard.writeText(currentUrl);status.textContent="Video link copied. Share it with your voice channel.";}
 catch{input.value=currentUrl;input.focus();input.select();status.textContent="Select and copy the video link above.";}
});
$("dlWatchChatToggle").addEventListener("click",e=>{
 const chat=$("dlWatchChat"),visible=chat.hidden;
 chat.hidden=!visible;e.currentTarget.setAttribute("aria-pressed",String(visible));
 e.currentTarget.querySelector("b").textContent=visible?"Hide chat overlay":"Show chat overlay";
});
$("dlWatchTheater").addEventListener("click",()=>{
 const active=overlay.classList.toggle("dl-watch-theater-mode");
 $("dlWatchTheater").textContent=active?"Exit theater mode":"Theater mode";
});
$("dlWatchReload").addEventListener("click",()=>{
 if(!currentId){status.textContent="Load a video first.";return;}
 const id=currentId;input.value=currentUrl;loadVideo();
});
$("dlWatchClear").addEventListener("click",clearPlayer);
})();