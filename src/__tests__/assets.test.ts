import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VeylixClient } from '../client';
import { VeylixAPIError } from '../errors';

describe('AssetsModule', () => {
  let client: VeylixClient;

  beforeEach(() => {
    client = new VeylixClient('https://mock-api.veylix.com');
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // getAssetDetails
  // -----------------------------------------------------------------------

  describe('getAssetDetails()', () => {
    it('should call the correct endpoint with the asset ID', async () => {
      const mockAsset = {
        id: 'asset-42',
        name: 'Crystal Mech',
        ipfsHash: 'QmXyz123',
        creator: '0xCREATOR',
        topologyVerified: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockAsset,
      });

      const result = await client.assets.getAssetDetails('asset-42');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockAsset);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-api.veylix.com/assets/asset-42',
        expect.any(Object),
      );
    });

    it('should return an error for a non-existent asset', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Asset not found' }),
      });

      const result = await client.assets.getAssetDetails('nonexistent');

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
      expect(result.error?.statusCode).toBe(404);
      expect(result.error?.message).toBe('Asset not found');
    });

    it('should handle network failures gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));

      const result = await client.assets.getAssetDetails('asset-1');

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
      expect(result.error?.message).toBe('Network error');
    });
  });

  // -----------------------------------------------------------------------
  // fetchIPFSMetadata
  // -----------------------------------------------------------------------

  describe('fetchIPFSMetadata()', () => {
    it('should switch to the IPFS gateway and restore the original base URL', async () => {
      const ipfsData = { name: 'Crystal Mech', attributes: [{ trait: 'Rare' }] };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ipfsData,
      });

      const originalBaseUrl = client.baseUrl;
      const result = await client.assets.fetchIPFSMetadata('QmABC123');

      // Verify the fetch was made against the IPFS gateway
      expect(global.fetch).toHaveBeenCalledWith(
        'https://ipfs.io/ipfs/QmABC123',
        expect.any(Object),
      );

      // Verify the base URL was restored after the call
      expect(client.baseUrl).toBe(originalBaseUrl);
      expect(result.error).toBeNull();
      expect(result.data).toEqual(ipfsData);
    });

    it('should restore base URL even when the IPFS request fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        statusText: 'Gateway Timeout',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'IPFS gateway timeout' }),
      });

      const originalBaseUrl = client.baseUrl;
      const result = await client.assets.fetchIPFSMetadata('QmBADHASH');

      // Base URL must be restored regardless of outcome
      expect(client.baseUrl).toBe(originalBaseUrl);
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
    });

    it('should restore base URL even when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('IPFS unreachable'));

      const originalBaseUrl = client.baseUrl;
      const result = await client.assets.fetchIPFSMetadata('QmFAIL');

      expect(client.baseUrl).toBe(originalBaseUrl);
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
    });
  });
});
