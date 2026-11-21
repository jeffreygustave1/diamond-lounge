const PROJECT_ID = "diamond-lounge-7caf6";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let cachedKeys = null;
let keysFetchedAt = 0;

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function getSigningKey(kid) {
  if (!cachedKeys || Date.now() - keysFetchedAt > 3600000) {
    const response = await fetch(JWKS_URL, { cf: { cacheTtl: 3600 } });
    if (!response.ok) throw new Error("JWKS unavailable");
    const data = await response.json();
    cachedKeys = data.keys || [];
    keysFetchedAt = Date.now();
  }
  let key = cachedKeys.find((item) => item.kid === kid);
  if (!key) {
    cachedKeys = null;
    const response = await fetch(JWKS_URL);
    if (!response.ok) throw new Error("JWKS unavailable");
    const data = await response.json();
    cachedKeys = data.keys || [];
    keysFetchedAt = Date.now();
    key = cachedKeys.find((item) => item.kid === kid);
  }
  if (!key) throw new Error("Unknown signing key");
  return crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

async function verifyFirebaseToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token");
  const key = await getSigningKey(header.kid);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  const now = Math.floor(Date.now() / 1000);
  if (!verified || payload.iss !== `https://securetoken.google.com/${PROJECT_ID}` ||
      payload.aud !== PROJECT_ID || typeof payload.sub !== "string" || !payload.sub ||
      typeof payload.exp !== "number" || payload.exp <= now ||
      (typeof payload.iat === "number" && payload.iat > now + 300) ||
      (typeof payload.nbf === "number" && payload.nbf > now)) {
    throw new Error("Invalid token");
  }
  return payload;
}

export async function onRequestPost({ request, env }) {
  if (!env.METERED_SECRET_KEY) return new Response("Service unavailable", { status: 503 });
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
  try {
    const token = header.slice(7).trim();
    if (!token) return new Response("Unauthorized", { status: 401 });
    const payload = await verifyFirebaseToken(token);
    if (!payload.sub) return new Response("Unauthorized", { status: 401 });

    const response = await fetch(
      "https://diamondlounge.metered.live/api/v1/turn/credentials?apiKey=" +
        encodeURIComponent(env.METERED_SECRET_KEY)
    );
    if (!response.ok) return new Response("TURN provider unavailable", { status: 502 });
    const iceServers = await response.json();
    const hasTurn = Array.isArray(iceServers) && iceServers.some((server) => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.some((url) => typeof url === "string" && (url.startsWith("turn:") || url.startsWith("turns:")));
    });
    if (!hasTurn) return new Response("Invalid ICE configuration", { status: 502 });
    return new Response(JSON.stringify({ iceServers }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch {
    return new Response("Unauthorized or TURN service unavailable", { status: 401 });
  }
}
