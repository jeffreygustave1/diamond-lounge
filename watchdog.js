/* Diamond Lounge Watchdog — lightweight client-side diagnostics.
   Captures browser-side errors for review; does not transmit logs or modify app code. */
(() => {
  if (window.__diamondWatchdogInstalled) return;
  window.__diamondWatchdogInstalled = true;

  const MAX = 80, entries = [];
  const originalConsoleError = console.error.bind(console);
  function record(type, message, details = {}) {
    const entry = { time: new Date().toISOString(), type, message: String(message || "Unknown error").slice(0, 1200), details };
    entries.push(entry);
    if (entries.length > MAX) entries.shift();
    render();
  }
  function safeDetails(value) {
    try { return typeof value === "string" ? value.slice(0, 500) : String(value); }
    catch { return "[unavailable]"; }
  }

  window.addEventListener("error", event => {
    record("JavaScript error", event.message || "Script error", {
      file: event.filename || "", line: event.lineno || 0, column: event.colno || 0
    });
  });
  window.addEventListener("unhandledrejection", event => {
    record("Unhandled promise rejection", safeDetails(event.reason));
  });
  console.error = (...args) => {
    record("Console error", args.map(safeDetails).join(" "));
    originalConsoleError(...args);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    let label = "";
    try { label = typeof args[0] === "string" ? args[0] : (args[0]?.url || "request"); } catch {}
    try {
      const response = await originalFetch(...args);
      if (!response.ok) record("HTTP request failure", response.status + " " + response.statusText, { url: label });
      return response;
    } catch (error) {
      record("Network failure", safeDetails(error), { url: label });
      throw error;
    }
  };

  let panel, list, count, toggle;
  function render() {
    if (!list || !count) return;
    count.textContent = String(entries.length);
    list.replaceChildren();
    entries.slice().reverse().forEach(item => {
      const row = document.createElement("div");
      row.style.cssText = "padding:9px 10px;border-bottom:1px solid #333;font-size:12px;word-break:break-word";
      const time = document.createElement("div");
      time.textContent = new Date(item.time).toLocaleTimeString();
      time.style.cssText = "opacity:.65;margin-bottom:3px";
      const heading = document.createElement("strong");
      heading.textContent = item.type;
      const msg = document.createElement("div");
      msg.textContent = item.message;
      msg.style.cssText = "margin-top:4px;white-space:pre-wrap";
      row.append(time, heading, msg);
      if (item.details && Object.keys(item.details).length) {
        const detail = document.createElement("small");
        detail.textContent = Object.entries(item.details).map(([k,v]) => k + ": " + v).join(" | ");
        detail.style.cssText = "display:block;opacity:.7;margin-top:5px";
        row.appendChild(detail);
      }
      list.appendChild(row);
    });
  }
  function installUI() {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.setAttribute("aria-label", "Open Diamond Lounge diagnostics");
    badge.textContent = "◇ Watchdog ";
    count = document.createElement("span");
    count.textContent = "0";
    badge.appendChild(count);
    badge.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483000;border:1px solid #4a78aa;border-radius:12px;background:#101923;color:#dcecff;padding:8px 12px;font:12px system-ui;box-shadow:0 4px 18px #0006;cursor:pointer";
    panel = document.createElement("div");
    panel.style.cssText = "display:none;position:fixed;right:12px;bottom:54px;width:min(420px,calc(100vw - 24px));max-height:min(60vh,520px);z-index:2147483000;background:#101318;color:#eee;border:1px solid #44566b;border-radius:14px;box-shadow:0 8px 30px #0009;font:13px system-ui;overflow:hidden";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #333";
    const title = document.createElement("strong"); title.textContent = "Diamond Watchdog";
    const clear = document.createElement("button"); clear.textContent = "Clear"; clear.style.cssText = "margin-left:auto";
    const close = document.createElement("button"); close.textContent = "Close";
    header.append(title,clear,close);
    list = document.createElement("div"); list.style.cssText = "overflow:auto;max-height:calc(60vh - 45px)";
    const empty = document.createElement("div"); empty.textContent = "No browser errors recorded this session."; empty.style.cssText = "padding:12px;opacity:.7";
    list.appendChild(empty);
    panel.append(header,list);
    badge.addEventListener("click",()=>{panel.style.display=panel.style.display==="none"?"block":"none";});
    close.addEventListener("click",()=>panel.style.display="none");
    clear.addEventListener("click",()=>{entries.length=0;render();list.innerHTML='<div style="padding:12px;opacity:.7">No browser errors recorded this session.</div>';count.textContent="0";});
    document.body.append(badge,panel);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installUI, {once:true});
  else installUI();
  window.DiamondWatchdog = { getReports: () => entries.slice(), clear: () => { entries.length=0; render(); } };
  record("Watchdog started", "Browser diagnostics enabled for this session.");
})();