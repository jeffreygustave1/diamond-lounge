/* Diamond Lounge Watchdog — mobile-accessible on-device diagnostics. */
(() => {
  if (window.__diamondWatchdogInstalled) return;
  window.__diamondWatchdogInstalled = true;
  const MAX=80, entries=[];
  const originalConsoleError=console.error.bind(console);
  let badge,count,panel;
  function safeDetails(value){try{return typeof value==="string"?value.slice(0,500):String(value);}catch{return "[unavailable]";}}
  function record(type,message,details={}) {
    entries.push({time:new Date().toISOString(),type,message:String(message||"Unknown error").slice(0,1200),details});
    if(entries.length>MAX)entries.shift();
    render();
  }
  // Navigation tap tracer: captures the actual topmost element and sidebar state on mobile.
  window.addEventListener("pointerdown",event=>{
    const target=event.target;const nav=target?.closest?.("button,.server-icon,.text-channel,.mobile-menu-button,#mobileSidebar,#channelsSidebar");
    if(!nav)return;let top="";try{top=document.elementFromPoint(event.clientX,event.clientY)?.tagName+"#"+(document.elementFromPoint(event.clientX,event.clientY)?.id||"")+"."+(document.elementFromPoint(event.clientX,event.clientY)?.className||"");}catch{}
    record("Navigation tap",nav.tagName+"#"+(nav.id||"")+"."+(typeof nav.className==="string"?nav.className:""),{topmost:top,point:{x:event.clientX,y:event.clientY},mobileNavOpen:!!document.querySelector(".dashboard.mobile-nav-open"),dmMode:document.body.classList.contains("dm-mode"),targetText:(nav.innerText||nav.getAttribute("aria-label")||"").slice(0,100)});
  },true);
  window.addEventListener("error",event=>{
    if(event.target&&event.target!==window){
      const el=event.target;record("Resource load failure",el.src||el.href||el.tagName,{tag:el.tagName||"",url:el.src||el.href||""});return;
    }
    record("JavaScript error",event.message||"Script error",{file:event.filename||"",line:event.lineno||0,column:event.colno||0});
  },true);
  window.addEventListener("unhandledrejection",event=>record("Unhandled promise rejection",safeDetails(event.reason)));
  console.error=(...args)=>{record("Console error",args.map(safeDetails).join(" "));originalConsoleError(...args);};
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    let label="";try{label=typeof args[0]==="string"?args[0]:(args[0]?.url||"request");}catch{}
    try{const response=await originalFetch(...args);if(!response.ok)record("HTTP request failure",response.status+" "+response.statusText,{url:label});return response;}
    catch(error){record("Network failure",safeDetails(error),{url:label});throw error;}
  };
  function redact(value){return String(value??"").replace(/(token|password|passwd|secret|authorization|api[_-]?key|credential)([=: ]+)[^&\\s,;]+/gi,"$1$2[REDACTED]").replace(/([?&](?:token|key|auth|password|secret)=)[^&\\s]+/gi,"$1[REDACTED]");}
  function reportText(){const header=["DIAMOND LOUNGE DIAGNOSTIC REPORT","Time: "+new Date().toISOString(),"Page: "+location.origin+location.pathname,"Browser: "+navigator.userAgent,"Events captured: "+entries.length,""];return header.concat(entries.map((e,i)=>[i+1,e.time,e.type,redact(e.message),redact(JSON.stringify(e.details))].join("\n")).join("\n\n")).join("\n");}
  function openPanel(){if(panel){panel.style.display="flex";render();}}
  function closePanel(){if(panel)panel.style.display="none";}
  function installUI(){
    badge=document.createElement("button");badge.type="button";badge.setAttribute("aria-label","Open Diamond Watchdog diagnostics");
    badge.style.cssText="z-index:20;border:0;background:transparent;color:#dcecff;display:flex;align-items:center;gap:0;padding:0;font:11px system-ui;cursor:pointer;white-space:nowrap;flex-shrink:0";
    const gem=document.createElement("img");gem.src="../diamond.gif";gem.alt="";gem.style.cssText="width:30px;height:30px;object-fit:contain;flex-shrink:0";
    const label=document.createElement("span");label.textContent="DIAMOND WATCHDOG";label.style.cssText="letter-spacing:.4px";
    count=document.createElement("span");count.style.cssText="opacity:.75;font-size:10px;margin-left:8px";
    badge.append(gem,label,count);badge.addEventListener("click",openPanel);
    panel=document.createElement("section");panel.setAttribute("role","dialog");panel.setAttribute("aria-label","Diamond Watchdog error report");
    panel.style.cssText="position:fixed;inset:0;z-index:2147483647;background:rgba(5,7,12,.94);color:#edf3ff;display:none;flex-direction:column;padding:env(safe-area-inset-top,12px) 12px env(safe-area-inset-bottom,12px);font:14px system-ui;box-sizing:border-box";
    panel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 0"><strong style="font-size:17px">DIAMOND WATCHDOG</strong><button data-close style="padding:10px 14px;border-radius:10px">Close</button></div><div data-summary style="padding:8px 0"></div><div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0"><button data-copy style="padding:10px;border-radius:10px">Copy report</button><button data-clear style="padding:10px;border-radius:10px">Clear logs</button></div><pre data-log style="overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#151922;border:1px solid #303746;border-radius:12px;padding:12px;flex:1;min-height:0;margin:0;font:12px ui-monospace,monospace"></pre>';
    panel.querySelector("[data-close]").onclick=closePanel;
    panel.querySelector("[data-copy]").onclick=async()=>{const t=reportText()||"No errors recorded.";try{await navigator.clipboard.writeText(t);panel.querySelector("[data-summary]").textContent="Report copied — paste it into your ChatGPT chat."; }catch{try{const ta=document.createElement("textarea");ta.value=t;ta.style.cssText="position:fixed;opacity:0";panel.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();panel.querySelector("[data-summary]").textContent="Copy attempted. Paste the report into ChatGPT."; }catch{panel.querySelector("[data-summary]").textContent="Copy failed. Select the report text below manually.";}}};
    panel.querySelector("[data-clear]").onclick=()=>{entries.length=0;render();};
    panel.addEventListener("click",e=>{if(e.target===panel)closePanel();});
    const mobileFit=document.createElement("style");
    mobileFit.textContent="@media(max-width:600px){#supportBotView .support-bot-header{min-width:0!important;overflow:hidden!important}#supportBotView #supportBotOpen{min-width:0!important;flex-shrink:1!important}#supportBotView [aria-label='Open Diamond Watchdog diagnostics']{max-width:48vw!important;min-width:0!important;overflow:hidden!important;gap:3px!important;font-size:9px!important}#supportBotView [aria-label='Open Diamond Watchdog diagnostics'] img{width:24px!important;height:32px!important;object-fit:contain!important}#supportBotView [aria-label='Open Diamond Watchdog diagnostics'] span{overflow:hidden!important;text-overflow:ellipsis!important}#supportBotView [aria-label='Open Diamond Watchdog diagnostics'] span:last-child{margin-left:3px!important}section[aria-label='Diamond Watchdog error report']{height:100dvh!important;max-height:100dvh!important;min-height:0!important;padding:calc(env(safe-area-inset-top,0px)+8px) 10px calc(env(safe-area-inset-bottom,0px)+8px)!important;overflow:hidden!important}section[aria-label='Diamond Watchdog error report']>div:first-child{padding:6px 0!important;flex:0 0 auto!important}section[aria-label='Diamond Watchdog error report']>div:first-child strong{font-size:15px!important}section[aria-label='Diamond Watchdog error report']>div:first-child button{padding:8px 12px!important}section[aria-label='Diamond Watchdog error report']>[data-summary]{flex:0 0 auto!important;padding:5px 0!important;font-size:12px!important;max-height:15vh!important;overflow:auto!important}section[aria-label='Diamond Watchdog error report']>div:nth-child(3){flex:0 0 auto!important;padding:5px 0!important}section[aria-label='Diamond Watchdog error report']>div:nth-child(3) button{padding:8px!important;font-size:12px!important}section[aria-label='Diamond Watchdog error report'] [data-log]{flex:1 1 0!important;min-height:0!important;height:auto!important;overflow-y:auto!important;overscroll-behavior:contain!important;font-size:11px!important;padding:8px!important}}";
    document.head.appendChild(mobileFit);
    document.body.appendChild(panel);
    const botView=document.getElementById("supportBotView");
    const diagButton=document.getElementById("dlDiagBtn");
    let controls=null;
    function rebuildControls(){
      badge.style.display="none";
      if(diagButton)diagButton.style.display="none";
      if(!botView || botView.hidden)return;
      const header=botView.querySelector(".support-bot-header");
      if(!header)return;
      header.querySelectorAll('[aria-label="Support diagnostic controls"]').forEach(el=>el.remove());
      controls=document.createElement("div");
      controls.setAttribute("aria-label","Support diagnostic controls");
      controls.style.cssText="display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:2px;width:126px;min-width:126px;max-width:126px;flex:0 0 126px;margin-left:auto;box-sizing:border-box;position:relative;z-index:50;overflow:visible;";
      const diagControl=document.createElement("button");
      diagControl.type="button";
      diagControl.textContent="DIAG";
      diagControl.setAttribute("aria-label","Open Diamond Lounge diagnostics");
      diagControl.style.cssText="display:block!important;position:static!important;background:#17416c!important;color:#fff!important;border:1px solid #fff!important;margin:0 0 2px 0!important;padding:4px 10px!important;font-size:11px!important;border-radius:6px!important;flex:0 0 auto!important;cursor:pointer!important;min-height:24px!important;min-width:45px!important;opacity:1!important;visibility:visible!important";
      diagControl.addEventListener("click",openPanel);
      controls.appendChild(diagControl);
      badge.style.cssText="display:flex!important;position:static!important;align-items:center;justify-content:flex-start;flex-direction:row!important;flex-wrap:nowrap!important;white-space:nowrap!important;gap:0!important;padding:0!important;width:126px!important;max-width:126px!important;min-width:126px!important;flex:0 0 126px!important;font-size:9px!important;overflow:visible!important";
      const gem=badge.querySelector("img");if(gem)gem.style.cssText="width:27px;height:27px;object-fit:contain;flex-shrink:0;margin-right:3px";
      const spans=badge.querySelectorAll("span");if(spans[0])spans[0].style.cssText="font-size:8px;letter-spacing:0;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important;flex:0 0 auto!important;transform:translateX(-5px)!important";if(spans[1])spans[1].style.cssText="font-size:7px;margin-left:3px!important;opacity:.75;transform:translateX(-5px)!important";
      controls.appendChild(badge);
      header.appendChild(controls);
      header.style.cssText="display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;flex-wrap:nowrap!important;min-width:0!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;padding:5px 8px!important;overflow:hidden!important;height:72px!important;min-height:72px!important;max-height:72px!important;flex:0 0 72px!important;align-self:flex-start!important";
      const main=header.querySelector(".chat-header-main");
      if(main)main.style.cssText="display:flex!important;align-items:center!important;gap:8px!important;flex:1 1 auto!important;min-width:0!important;max-width:calc(100% - 131px)!important;overflow:hidden!important";
      const avatar=header.querySelector(".support-bot-avatar");
      if(avatar)avatar.style.cssText="width:40px!important;height:40px!important;min-width:40px!important;max-width:40px!important;object-fit:contain!important;transform:none!important;flex:0 0 40px!important";
      const title=header.querySelector("#supportBotTitle");
      if(title)title.style.cssText="font-size:14px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important";
    }
    function sync(){rebuildControls();}
    if(botView){sync();new MutationObserver(sync).observe(botView,{attributes:true,attributeFilter:["hidden"]});}
    render();
  }
  function render(){if(count)count.textContent=String(entries.length);if(panel){panel.querySelector("[data-summary]").textContent=entries.length+" captured event(s). Stored locally in this page session. Copy the report to share it.";panel.querySelector("[data-log]").textContent=entries.length?reportText():"No errors captured yet. If the app is blank, refresh and reproduce the issue, then reopen Watchdog.";}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installUI,{once:true});else installUI();
  window.DiamondWatchdog={getReports:()=>entries.slice(),clear:()=>{entries.length=0;render();},open:openPanel};
  record("Watchdog started","Diagnostics enabled for this browser session.");
})();