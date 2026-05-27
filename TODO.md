# VEYLIX Core SDK - TODO

## ✅ Short-Term Goals (Sprint 1) — DONE
- [x] **Marketplace Module:** `getListings()`, `verifyAsset()`.
- [x] **Assets Module:** `getAssetDetails()`, `fetchIPFSMetadata()` (race-condition safe).
- [x] **Error Handling:** `VeylixAPIError`, `VeylixAuthError`.

## ✅ Mid-Term Goals (Sprint 2) — DONE
- [x] **Wallet/Auth Integration:** SIWE payload generation.
- [x] **Testing:** Vitest — 50 unit tests (100% module coverage).
- [x] **WebSocket Tests:** `websocket.test.ts` — 23 tests covering all events, reconnection, heartbeat.
- [x] **Documentation:** TypeDoc auto-generated API references.

## ✅ Long-Term Goals — DONE
- [x] **CI/CD Pipeline:** GitHub Actions — test on PR, publish on `v*` tags.
- [x] **WebSockets:** Real-time telemetry with typed event system.

## 🚀 Next: NPM Publish Checklist
- [ ] Set `NPM_TOKEN` secret in GitHub repo → Settings → Secrets → Actions.
- [ ] Create `CHANGELOG.md` for v0.1.0.
- [ ] Create GitHub Release with tag `v0.1.0` to trigger CI/CD auto-publish.
  - Or: run `npm publish` manually after `npm run build`.
