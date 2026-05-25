import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VeylixClient } from '../client';
import { VeylixAPIError } from '../errors';
import type { Listing } from '../modules/marketplace';

describe('MarketplaceModule', () => {
  let client: VeylixClient;

  beforeEach(() => {
    client = new VeylixClient('https://mock-api.veylix.com');
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // getListings
  // -----------------------------------------------------------------------

  describe('getListings()', () => {
    it('should return a parsed array of marketplace listings', async () => {
      const mockListings: Listing[] = [
        { id: '1', assetId: 'asset-001', seller: '0xABC', price: '0.5', isActive: true },
        { id: '2', assetId: 'asset-002', seller: '0xDEF', price: '1.2', isActive: true },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockListings,
      });

      const result = await client.marketplace.getListings();

      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockListings);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].assetId).toBe('asset-001');
    });

    it('should pass the limit query parameter to the endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      await client.marketplace.getListings(25);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-api.veylix.com/marketplace/listings?limit=25',
        expect.any(Object),
      );
    });

    it('should default limit to 10 when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      await client.marketplace.getListings();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-api.veylix.com/marketplace/listings?limit=10',
        expect.any(Object),
      );
    });

    it('should return an error when the API responds with a failure status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Marketplace service unavailable' }),
      });

      const result = await client.marketplace.getListings();

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
      expect(result.error?.message).toBe('Marketplace service unavailable');
    });

    it('should handle network failures gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await client.marketplace.getListings();

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
      expect(result.error?.message).toBe('Failed to fetch');
    });
  });

  // -----------------------------------------------------------------------
  // verifyAsset
  // -----------------------------------------------------------------------

  describe('verifyAsset()', () => {
    it('should send the correct POST body to the verify endpoint', async () => {
      const mockVerification = { verified: true, signature: '0xSIG123' };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockVerification,
      });

      const result = await client.marketplace.verifyAsset('asset-001');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockVerification);

      // Verify correct endpoint and method
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-api.veylix.com/marketplace/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ assetId: 'asset-001' }),
        }),
      );
    });

    it('should return verification failure data from the API', async () => {
      const mockFailure = { verified: false, signature: '' };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockFailure,
      });

      const result = await client.marketplace.verifyAsset('bad-asset');

      expect(result.error).toBeNull();
      expect(result.data?.verified).toBe(false);
    });

    it('should handle server errors during verification', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Invalid asset ID format' }),
      });

      const result = await client.marketplace.verifyAsset('!invalid!');

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
      expect(result.error?.statusCode).toBe(422);
    });
  });
});
