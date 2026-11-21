# Diamond Lounge customization shop

## Launch collections

The profile editor contains a real, selectable styling catalog:

- **Profile auras:** Natural, Moonlight, Starlight, Aurora, Nebula, Ember, Frost and Rose.
- **Avatar frames:** No frame, Silver, Gold, Diamond, Aurora, Obsidian, Rose Gold, Celestial and Sapphire.
- **Nameplates:** Classic, Champagne, Silverline, Aurora, Sapphire, Rose Gold, Obsidian, Emerald and Violet.
- **Collectible profile badges:** Comet, Starlight, Music Lover, Gamer, Creator, Artist, Explorer, Builder, Bookworm, Bloom, Frost, Flame, Crown, Moon and Crystal. Users can equip up to three; they appear beside the display name and never cover the avatar.
- **Profile backdrops:** Midnight, Aurora, Sapphire, Rose, Emerald, Sunset, Violet and Champagne.
- **Server themes:** Midnight, Aurora, Sapphire, Rose, Emerald, Sunset, Violet and Champagne. A server owner can set the shared theme for their own created server.

The launch styling collection is free for all members. The Diamond Lounge owner also receives the Silver GIF pack for free. Regular members still need the Silver entitlement for animated profile GIF uploads.

## Profile storage and security

- User cosmetic choices are saved under `users/{uid}.cosmetics`.
- Firestore rules restrict the values to the published catalog IDs and allow up to three profile badge IDs.
- Voice presence documents share the current user's validated cosmetic selection so other members see badge chips and nameplate styling in voice.
- Server appearance is stored as `servers/{serverId}.appearanceTheme`; only the server owner can edit the server document.
- Silver GIF profile images are stored as Firestore data URLs capped at 400 KB. The separate Silver purchase entitlement is checked by Firestore rules and the owner UID bypass is fixed in the rules.
- The app does not need Firebase Storage / Blaze billing for the current profile GIF implementation.

## Silver GIF and payments

- Silver GIF profile uploads are implemented.
- Animated server-icon uploads are not implemented.
- The premium worker currently has a Silver GIF checkout/webhook path, but it still requires its Stripe/Firebase secrets, price ID and end-to-end test-mode verification before member checkout can be considered live.
- Other styling choices are intentionally free in the launch catalog; future paid packs must use server-verified entitlements and webhook grants, not client-side flags.

## Advertising and partnerships

The site can host clearly labeled sponsor placements for direct brand partnerships. No ad network or live advertiser inventory is connected yet. Any partner campaign should have a written agreement, approved creative, placement dates, click destination, payment terms and a clear "Sponsored" disclosure. Do not show a company's logo or claim a partnership until it has been approved by that company.
