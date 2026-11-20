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
    renderCountOnly();
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

  let badge, count;
  function installUI() {
    badge = document.createElement("div");
    badge.setAttribute("aria-label", "Diamond Lounge diagnostics status");
    badge.style.cssText = "z-index:10;border:0;background:transparent;color:#dcecff;display:flex;align-items:center;justify-content:flex-start;gap:0;padding:0;font:11px system-ui;cursor:default;white-space:nowrap;flex-shrink:0";
    const gem = document.createElement("img");
    gem.src = "diamond.gif";
    gem.alt = "";
    gem.style.cssText = "width:168px;height:168px;object-fit:contain;flex-shrink:0;transform:translateX(12px)";
    const label = document.createElement("span");
    label.textContent = "DIAMOND WATCHDOG";
    label.style.cssText = "letter-spacing:.4px;margin-left:0px";
    badge.append(gem,label);
    count = document.createElement("span");
    count.textContent = "0";
    count.style.cssText = "opacity:.75;font-size:10px";
    badge.appendChild(count);

    // Keep diagnostics passive and place them tightly centered inside the Support header.
    const botView = document.getElementById("supportBotView");
    function syncBotVisibility() {
      const active = !!botView && !botView.hidden;
      badge.style.display = active ? "flex" : "none";
      if (active) {
        const header = botView.querySelector(".support-bot-header");
        if (header && badge.parentElement !== header) {
          header.appendChild(badge);
          header.style.cssText += ";justify-content:center;gap:12px;flex-wrap:wrap";
        }
      }
    }
    if (botView) {
      syncBotVisibility();
      new MutationObserver(syncBotVisibility).observe(botView, {attributes:true,attributeFilter:["hidden"]});
    } else badge.style.display = "none";
    renderCountOnly();
  }
  function renderCountOnly() { if (count) count.textContent = String(entries.length); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installUI, {once:true});
  else installUI();
  window.DiamondWatchdog = { getReports: () => entries.slice(), clear: () => { entries.length=0; renderCountOnly(); } };
  record("Watchdog started", "Browser diagnostics enabled for this session.");
})();