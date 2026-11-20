# Diamond Lounge — Phone verification links (development)

## Goal
Replace the account-linking SMS code form with a clickable, single-use SMS verification link, then attach the verified phone to the existing Firebase UID. Keep the Google/email methods and unlink protections.

## Important architecture constraint
Firebase's built-in Phone Auth on the web uses SMS verification codes. A custom clickable SMS link requires a separate verification service. A verified external link alone is **not** a Firebase Phone Auth credential, so the implementation must not pretend that it is.

## Proposed zero-cost-first architecture
- Cloudflare Worker (free-tier eligible, subject to current limits) as the verification endpoint.
- Durable Object or KV storage for short-lived, one-use challenges. KV alone is not ideal for strict atomic single-use; prefer Durable Objects for consumption/locking.
- SMS delivery adapter remains unconfigured until an SMS provider with a legitimate free tier is identified. SMS service fees may apply.
- Verify Firebase ID token server-side, associate the challenge with the authenticated UID, and only then change the phone number. Never accept a UID alone.
- On completion, use a server-side Firebase Admin-capable approach (credential stored as a Worker secret, never committed) and check conflicts before updating. This must be tested in a Firebase test project first.
- Rate-limit requests per authenticated UID, phone, and IP; normalize phone numbers (E.164); expire challenges quickly; prevent replay; do not log tokens or full phone numbers.
- Account Linking UI should expose request-link, link-complete, and unlink states; unlink only if another provider remains.

## Progress
- [x] Repository architecture documented.
- [ ] Confirm a no-cost SMS provider and current pricing/free-tier restrictions.
- [ ] Provision Worker and challenge store without committing credentials.
- [ ] Implement and test challenge creation/consumption.
- [ ] Implement Firebase linking through a server-side, authenticated and verified process.
- [ ] Add click-to-verify UI and unlink UI.
- [ ] Test abuse controls, expired/replayed links, account conflicts, and normal login.

## Deployment
Nothing here is deployed or sending messages yet. Do not expose the endpoints publicly until the missing safeguards, provider integration, secrets, and tests are complete.
