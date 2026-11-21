import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT_ID = "diamond-lounge-7caf6";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

const FALLBACK_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" }
];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ") || !env.METERED_SECRET_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const token = header.slice(7).trim();
    if (!token) return new Response("Unauthorized", { status: 401 });
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID
    });
    if (!payload.sub || typeof payload.sub !== "string") {
      return new Response("Unauthorized", { status: 401 });
    }

    // Create a time-limited credential. 24 hours allows propagation and long calls.
    const createResponse = await fetch(
      "https://diamondlounge.metered.live/api/v1/turn/credential?secretKey=" + encodeURIComponent(env.METERED_SECRET_KEY),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiryInSeconds: 86400, label: "diamond-lounge-session" })
      }
    );
    if (!createResponse.ok) {
      return new Response("TURN provider unavailable", { status: 502 });
    }
    const created = await createResponse.json();
    if (!created?.apiKey) return new Response("Invalid TURN provider response", { status: 502 });

    // Fetch the provider's full ICE list so relay URLs and transports are provider-configured.
    const iceResponse = await fetch(
      "https://diamondlounge.metered.live/api/v1/turn/credentials?apiKey=" + encodeURIComponent(created.apiKey)
    );
    if (!iceResponse.ok) return new Response("TURN configuration unavailable", { status: 502 });
    const iceServers = await iceResponse.json();
    if (!Array.isArray(iceServers) || !iceServers.some((server) => String(server?.urls || "").startsWith("turn"))) {
      return new Response("Invalid ICE configuration", { status: 502 });
    }

    return new Response(JSON.stringify({ iceServers }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("TURN credential endpoint failed");
    return new Response("Unauthorized or TURN service unavailable", { status: 401 });
  }
}
