# Verification Suite

This repository now exposes a repeatable set of diagnostics that cover the client, server, transport guarantees, database state, browser E2E, and a lightweight load test. Run the commands below from the repository root.

```bash
docker compose up -d      # MongoDB + Redis
npm ci
npm run verify:client
npm run verify:server
npm run verify:ciphertext
npm run verify:e2e
npm run verify:db
npm run verify:load
```

## Reports and Logs

- **Playwright (browser E2E)** – HTML report is emitted to `client/playwright-report`. Open it with `npx playwright show-report client/playwright-report`.
- **Artillery (load)** – Console output includes latency metrics (look for the `p95` line) and error counts. Redirect stdout/stderr to persist the report if needed.
- **Ciphertext verifier** – `scripts/verify-ciphertext.mjs` prints detailed diagnostics and exits with a non-zero status if plaintext fields, non-base64 payloads, or rejected ciphertext are observed.
- **Database verifier** – `scripts/verify-db.mjs` inspects the `messages` collection for plaintext leakage and prints a one-line summary.

All scripts exit with code `0` on success and a non-zero code otherwise, allowing them to compose in CI pipelines via `npm run verify:all`.
