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
  function reportText(){const header=["DIAMOND LOUNGE DIAGNOSTIC REPORT","Time: "+new Date().toISOString(),"Page: "+location.origin+location.pathname,"Browser: "+navigator.userAgent,"Events captured: "+entries.length,""];return header.concat(entries.map((e,i)=>[i+1,e.time,e.type,redact(e.message),redact(JSON.stringify(e.details))].join("\\n")).join("\\n\\n")).join("\\n");}
  function openPanel(){if(panel){panel.style.display="flex";render();}}
  function closePanel(){if(panel)panel.style.display="none";}
  function installUI(){
    badge=document.createElement("button");badge.type="button";badge.setAttribute("aria-label","Open Diamond Watchdog diagnostics");
    badge.style.cssText="position:fixed;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:2147483646;border:1px solid #6684a9;background:rgba(12,18,29,.96);color:#dcecff;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:24px;font:12px system-ui;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:0 4px 18px #0008";
    const gem=document.createElement("img");gem.src="diamond.gif";gem.alt="";gem.style.cssText="width:22px;height:28px;object-fit:cover;flex-shrink:0";
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
    document.body.appendChild(panel);
    document.body.appendChild(badge);
    render();
  }

  }
  function render(){if(count)count.textContent=String(entries.length);if(panel){panel.querySelector("[data-summary]").textContent=entries.length+" captured event(s). Stored locally in this page session. Copy the report to share it.";panel.querySelector("[data-log]").textContent=entries.length?reportText():"No errors captured yet. If the app is blank, refresh and reproduce the issue, then reopen Watchdog.";}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installUI,{once:true});else installUI();
  window.DiamondWatchdog={getReports:()=>entries.slice(),clear:()=>{entries.length=0;render();},open:openPanel};
  record("Watchdog started","Diagnostics enabled for this browser session.");
})();