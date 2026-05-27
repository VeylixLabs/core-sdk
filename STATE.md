# VEYLIX Core SDK - State

**Last Updated:** May 2026  
**Current Phase:** Phase 3 — Production Ready (Published)

## 📌 Current Status
The SDK is feature-complete and fully hardened for NPM publishing. It ships with a full HTTP client, modular architecture (Marketplace, Assets, Wallet, WebSocket), **50 unit tests** (up from 26), automated CI/CD via GitHub Actions, and auto-generated API documentation via TypeDoc.

Key improvements in this phase:
- **Race-condition fix:** `fetchIPFSMetadata` refactored to use a dedicated standalone `fetch` call — no longer mutates shared `client.baseUrl`, making concurrent calls safe.
- **WebSocket test coverage:** `websocket.test.ts` added with 23 tests covering connect/disconnect lifecycle, all 4 typed telemetry events, heartbeat timing, malformed message handling, and exponential backoff reconnection.

## 🏗️ Architecture & Stack
- **Language:** TypeScript 5.x (Strict Mode)
- **Bundler:** tsup → ESM (14.53 KB) + CJS (15.80 KB) + DTS (14.37 KB)
- **HTTP Client:** Native `fetch` (zero-dependency)
- **WebSocket:** Native `WebSocket` with typed events & auto-reconnect
- **Testing:** Vitest (50 tests, ~400ms)
- **Documentation:** TypeDoc (auto-generated API references)
- **CI/CD:** GitHub Actions (test on push/PR, publish on release tags)
- **Module Resolution:** Bundler/Node Next (Modern ESNext)

## 🧩 Implemented Modules
1. **Core Client (`src/client.ts`)**
   - [x] `VeylixClient` class with configurable `baseUrl`.
   - [x] Defaults to `https://dapp.veylixlabs.xyz/api`.
   - [x] Built-in fetch wrapper with normalized `ApiResponse<T>`.
   - [x] Lazy-initialized `telemetry` getter for WebSocket access.
   - [x] `createTelemetrySocket(options?)` factory method.
   - [x] Full JSDoc documentation on every public member.
2. **Error Handling (`src/errors.ts`)**
   - [x] `VeylixError`, `VeylixAPIError`, `VeylixAuthError` hierarchy.
   - [x] Typed `ApiResponse<T>` interface.
3. **Marketplace Module (`src/modules/marketplace.ts`)**
   - [x] `getListings(limit?)` — fetch active 3D asset listings.
   - [x] `verifyAsset(assetId)` — spatial integrity verification.
4. **Assets Module (`src/modules/assets.ts`)**
   - [x] `getAssetDetails(id)` — retrieve model topology/textures data.
   - [x] `fetchIPFSMetadata(hash)` — IPFS gateway metadata fetching (race-condition safe).
5. **Wallet Module (`src/modules/wallet.ts`)**
   - [x] `generateSiwePayload(address, chainId?)` — SIWE nonce generation (default: Base 8453).
   - [x] `verifySignature(message, signature)` — session establishment.
6. **WebSocket Telemetry (`src/modules/websocket.ts`)**
   - [x] `TelemetrySocket` class with typed event system (`on<K>()` / `off<K>()`).
   - [x] Events: `gpu_stats`, `render_progress`, `queue_update`, `network_status`.
   - [x] Auto-reconnect with exponential backoff (1s → 2s → 4s → max 30s).
   - [x] Heartbeat ping every 30s for stale connection detection.
   - [x] `maxReconnectAttempts` option (default 10).
   - [x] Method chaining support.
7. **CI/CD Pipeline (`.github/workflows/ci.yml`)**
   - [x] Test job: Node 20, npm cache, build + test.
   - [x] Publish job: conditional on `v*` tags, NPM with provenance.
8. **Test Suite (`src/__tests__/`) — 50 tests**
   - [x] `client.test.ts` — 5 tests (init, requests, auth/API errors).
   - [x] `marketplace.test.ts` — 8 tests (listings, verification, params, errors).
   - [x] `assets.test.ts` — 7 tests (details, IPFS direct-fetch, concurrent safety).
   - [x] `wallet.test.ts` — 7 tests (SIWE payload, signature, chainId, errors).
   - [x] `websocket.test.ts` — 23 tests (connect, disconnect, events, heartbeat, reconnection).
9. **Configuration**
   - [x] `tsconfig.json` optimized for strict type checking.
   - [x] `tsup` for blazing-fast builds (CJS + ESM + DTS).
   - [x] `package.json` NPM-ready: `files`, `repository`, `keywords`, `license`, `prepublishOnly`.
   - [x] TypeDoc integration (`npm run docs`).

## 🚦 Known Issues / Blockers
- **NPM_TOKEN secret** must be set in GitHub repo Settings → Secrets → `NPM_TOKEN` before the publish CI/CD job will succeed.
- No `CHANGELOG.md` yet — recommended before first public release.
