# diamond-lounge

## Diamond Support autonomous repair bridge

The repair bridge source is `diamond-support-github-bridge.js`. It is a separate Cloudflare Worker and is not deployed by Pages. The bridge authenticates requests by checking a Firebase ID token with Firebase Identity Toolkit and comparing the verified account UID against the `ADMIN_UID` secret. It creates a repair branch and pull request only; it does not push directly to `main` or auto-merge.

### Setup (Cloudflare Worker dashboard, free tier)

1. Create a separate Worker named `diamond-support-repair-bridge` and paste the contents of `diamond-support-github-bridge.js`.
2. Configure Worker secrets/variables:
   - `ADMIN_UID`: the Firebase Auth UID of the site owner (retrieve from Firebase Authentication user list; do not share publicly).
   - `GITHUB_TOKEN`: fine-grained personal access token restricted to this repository, with Contents (read/write) and Pull requests (read/write). Keep it as a secret; never put it in site JS.
3. Deploy the Worker. Confirm the Worker is running, then use the endpoint with an authenticated owner Firebase ID token and a proposed file list.
4. The current AI chat Worker still needs to be wired to this bridge to generate a candidate patch and call it. Do not enable autonomous patch submission until that integration is implemented and reviewed.

### Safety

- Bridge accepts requests only from the Pages origin and authenticated owner UID.
- It validates file paths and bounds patch size and file count.
- Repairs are pull requests for manual review, testing, and merge.
- Do not use paid services or enable billing for this setup.
