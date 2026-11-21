import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT_ID = "diamond-lounge-7caf6";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function onRequestPost({ request, env }) {
  if (!env.METERED_SECRET_KEY) {
    return new Response("Service unavailable", { status: 503 });
  }

  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) {
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

    // The Metered API key is a server-only Cloudflare secret.
    const response = await fetch(
      "https://diamondlounge.metered.live/api/v1/turn/credentials?apiKey=" +
        encodeURIComponent(env.METERED_SECRET_KEY)
    );
    if (!response.ok) {
      return new Response("TURN provider unavailable", { status: 502 });
    }

    const iceServers = await response.json();
    const hasTurn = Array.isArray(iceServers) && iceServers.some((server) => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.some((url) => typeof url === "string" && url.startsWith("turn:") || typeof url === "string" && url.startsWith("turns:"));
    });
    if (!hasTurn) return new Response("Invalid ICE configuration", { status: 502 });

    return new Response(JSON.stringify({ iceServers }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return new Response("Unauthorized or TURN service unavailable", { status: 401 });
  }
}
