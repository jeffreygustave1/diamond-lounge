# DIAMOND LOUNGE Premium Checkout Worker (initial scaffold)

This Worker creates Stripe Checkout sessions for the Silver GIF pack and verifies Stripe webhook signatures before writing the Firestore entitlement document using a service-account OAuth token.

## Before deployment
1. Create a Stripe product named **Silver GIF Profile & Server GIF Pack** and a one-time price. Copy the Price ID.
2. In Cloudflare, create a Worker named `diamond-lounge-premium` and deploy these source files.
3. Configure Worker secrets:
   - `STRIPE_SECRET`: Stripe secret key
   - `STRIPE_WEBHOOK_SECRET`: webhook signing secret (configure webhook URL as `https://YOUR-WORKER.workers.dev/webhook/stripe`)
   - `FIREBASE_API_KEY`: Firebase web API key from `firebase.js`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: service-account JSON (keep private; never commit)
4. Configure variables:
   - `PRICE_SILVER_GIF_PACK`: Stripe Price ID
   - `SITE_URL`: `https://diamond-lounge.pages.dev`
   - `FIREBASE_PROJECT_ID`: `diamond-lounge-7caf6`
5. Create a Stripe webhook endpoint for `checkout.session.completed`. Use the Worker URL.
6. Deploy Firestore rules; the `premiumEntitlements` rule allows the owner to read and blocks client writes.
7. Test using Stripe test mode and a test card before live mode.

## API
POST `/checkout/silver-gif-pack`
- Requires Firebase ID token in `Authorization: Bearer <token>`
- Returns Stripe Checkout URL.

POST `/webhook/stripe`
- Verifies Stripe signature.
- Writes `premiumEntitlements/{uid}` only for paid checkout session matching SKU.

## Important limitations / follow-up implementation
- This is an initial payment/entitlement scaffold, not a full production deployment.
- Refund/dispute revocation, webhook event idempotency, anti-abuse/rate limiting, upload authorization, file validation, and GIF UI application remain to implement.
- Do not enable live payments until test-mode webhook verification, entitlement reads and upload gates have been validated.
