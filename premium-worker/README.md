# DIAMOND LOUNGE Premium Checkout Worker

## Deploy in Stripe TEST mode first

### 1. Create the Stripe test product
In Stripe Dashboard, enable **Test mode**. Create a one-time product **Silver GIF Profile & Server GIF Pack**, create its price, and copy the Price ID (`price_...`).

### 2. Configure Firebase service credentials
Create a service account for Firebase project `diamond-lounge-7caf6` with the least privilege needed to write Firestore entitlement documents. Download its JSON key securely. Never commit it or paste it into chat.

### 3. Deploy from this folder
Install Node.js and Wrangler if needed:
```bash
npm install -g wrangler
wrangler login
cd premium-worker
wrangler deploy
```

### 4. Set Worker secrets
Run these commands and paste each value only into the terminal prompt:
```bash
wrangler secret put STRIPE_SECRET
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put FIREBASE_API_KEY
wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
```
Use Stripe **test-mode** keys during setup.

### 5. Configure the price variable
Edit `wrangler.toml` and add:
```toml
PRICE_SILVER_GIF_PACK = "price_REPLACE_WITH_TEST_PRICE_ID"
```
Then redeploy: `wrangler deploy`.

### 6. Add Stripe webhook
In Stripe Test mode, create an endpoint:
`https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev/webhook/stripe`
Subscribe to `checkout.session.completed`. Copy its signing secret (`whsec_...`), set it as `STRIPE_WEBHOOK_SECRET`, and redeploy.

### 7. Test
Sign in to DIAMOND LOUNGE and use the Silver GIF pack purchase button. Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC and postal code. Verify webhook delivery succeeds and Firestore `premiumEntitlements/{uid}` is granted.

## API
- `POST /checkout/silver-gif-pack`: Firebase ID token required; returns Stripe Checkout URL.
- `POST /webhook/stripe`: signature verified; grants entitlement only for a paid matching checkout.

## Security / limitations
- Never use live keys until end-to-end test mode succeeds.
- Refund/dispute revocation, webhook event idempotency, rate limiting, secure upload authorization/validation, and GIF UI application remain outstanding. Cosmetics are not fully secured or available yet.
- Keep service-account JSON, Stripe secrets and webhook secrets out of GitHub and chat.
