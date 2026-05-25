# VEYLIX Core SDK - TODO

## 🎯 Short-Term Goals (Sprint 1)
- [ ] **Marketplace Module:** 
  - Create `src/modules/marketplace.ts`.
  - Implement `getListings()` to fetch active 3D asset listings.
  - Implement `verifyAsset()` for spatial integrity checks.
- [ ] **Assets Module:** 
  - Create `src/modules/assets.ts`.
  - Implement IPFS metadata fetching methods.
  - Implement `getAssetDetails(id)` to retrieve model topology/textures data.
- [ ] **Error Handling:** 
  - Create custom error classes (e.g., `VeylixAPIError`, `VeylixAuthError`) for better developer experience.

## 🚀 Mid-Term Goals (Sprint 2)
- [ ] **Wallet/Auth Integration:** Add methods to generate SIWE (Sign-In with Ethereum) payloads.
- [ ] **Testing:** Setup `Vitest` or `Jest` and write unit tests for the HTTP client mock requests.
- [ ] **Documentation:** Setup typedoc to automatically generate API references from TypeScript comments.

## 🌟 Long-Term Goals
- [ ] **CI/CD Pipeline:** Setup GitHub Actions to run tests and automatically publish to NPM on release tags.
- [ ] **WebSockets:** Add support for real-time orchestration telemetry updates.
