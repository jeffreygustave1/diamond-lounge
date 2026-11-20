# Premium Customization — implementation foundation

## Catalogue
- Silver GIF pack: animated profile GIF and server icon GIF upload slots.
- Profile aura cosmetics
- Avatar frames
- Nameplate styles
- Exclusive profile badges
- Server themes and banners

## Payment and unlock design
1. Use Stripe Checkout (one-time cosmetic packs, with Silver GIF pack as the initial SKU).
2. Checkout sessions must be created by a trusted server after validating the signed-in Firebase user token.
3. Stripe webhook verifies its signature and then writes entitlements to Firestore.
4. The client may read its own `premiumEntitlements/{uid}` document but cannot write it (Firestore rule now enforced).
5. Upload / profile endpoints must verify the corresponding entitlement server-side before accepting premium assets.
6. Never unlock based on a client-supplied payment flag, query string, or local storage.
7. Include refunds/chargebacks in webhook revocation handling and keep asset size/type limits.

## Current state
- The storefront catalog UI is present in the profile editor.
- Firestore rule added: users can read only their own entitlement document; clients cannot write entitlement records.
- Payment provider, server checkout, webhook, asset storage and premium UI enforcement are not yet connected.
- Silver GIF uploads remain unavailable until checkout, webhook verification and server-side upload validation are deployed.

## Required deployment configuration (not committed)
- Stripe secret key
- Stripe webhook signing secret
- Firebase service-account credentials or equivalent narrowly scoped server credential
- Checkout success/cancel URL and server environment configuration
- Storage provider configuration for GIF uploads

## First purchase implementation order
Silver GIF pack -> checkout -> webhook entitlements -> secure image storage and validation -> profile/server icon rendering -> other cosmetic SKU entitlements.
