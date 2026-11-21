# Premium Customization — implementation foundation

## Catalogue
- Silver GIF pack: animated profile GIF upload.
- Profile aura cosmetics.
- Avatar frames.
- Nameplate styles.
- Exclusive profile badges.
- Server themes and banners.

## Access and payment design
1. Silver GIF access is granted by the trusted `premiumEntitlements/{uid}` document, or by the fixed Diamond Lounge owner UID.
2. Clients cannot write entitlement records; Firestore rules verify the GIF entitlement when a GIF data URL is saved.
3. The Silver GIF profile upload uses Firestore data URLs capped at 400 KB to avoid requiring Cloud Storage / Blaze billing for this small-file feature.
4. Never unlock based on a client-supplied payment flag, query string, or local storage.
5. A future Stripe checkout must validate Firebase ID tokens, verify webhook signatures, and write entitlements from a trusted server.
6. Refunds and chargebacks must revoke entitlements if paid cosmetics are enabled.

## Current state
- The storefront catalog UI is present in the profile editor.
- The Diamond Lounge owner receives Silver GIF profile upload access without checkout.
- Silver GIF profile uploads are limited to 400 KB and stored in the user's Firestore profile document.
- Animated server-icon uploads are not implemented yet.
- Profile auras, avatar frames, nameplates, badges, and server themes remain catalog previews, not equipable cosmetics.
- Stripe checkout and the paid-member purchase flow are not yet end-to-end deployed and verified.

## Future work
Silver paid checkout -> signed-in user validation -> verified Stripe webhook -> Firestore entitlement -> member GIF profile access -> optional server-icon upload implementation.
