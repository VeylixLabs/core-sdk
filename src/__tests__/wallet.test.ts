import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VeylixClient } from '../client';
import { VeylixAPIError, VeylixAuthError } from '../errors';

describe('WalletModule', () => {
  let client: VeylixClient;

  beforeEach(() => {
    client = new VeylixClient('https://mock-api.veylix.com');
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // generateSiwePayload
  // -----------------------------------------------------------------------

  describe('generateSiwePayload()', () => {
    it('should send the wallet address and chainId in the POST body', async () => {
      const mockPayload = {
        nonce: 'abc123nonce',
        message: 'Sign in to VEYLIX with Ethereum',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockPayload,
      });

      const result = await client.wallet.generateSiwePayload('0xUSER_WALLET', 8453);

      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockPayload);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-api.veylix.com/auth/siwe/nonce',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ address: '0xUSER_WALLET', chainId: 8453 }),
        }),
      );
    });

    it('should default chainId to 8453 (Base) when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ nonce: 'n', message: 'm' }),
      });

      await client.wallet.generateSiwePayload('0xADDRESS');

      const callBody = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(callBody.chainId).toBe(8453);
    });

    it('should accept a custom chainId', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ nonce: 'n', message: 'm' }),
      });

      await client.wallet.generateSiwePayload('0xADDRESS', 1);

      const callBody = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(callBody.chainId).toBe(1);
    });

    it('should return an error when the nonce endpoint fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Rate limit exceeded' }),
      });

      const result = await client.wallet.generateSiwePayload('0xADDRESS');

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
      expect(result.error?.statusCode).toBe(429);
    });
  });

  // -----------------------------------------------------------------------
  // verifySignature
  // -----------------------------------------------------------------------

  describe('verifySignature()', () => {
    it('should send the signed message and signature to the verify endpoint', async () => {
      const mockSession = { token: 'jwt-token-xyz', user: { id: 'u1' } };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSession,
      });

      const result = await client.wallet.verifySignature(
        'Sign in to VEYLIX...',
        '0xSIGNATURE',
      );

      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockSession);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-api.veylix.com/auth/siwe/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            message: 'Sign in to VEYLIX...',
            signature: '0xSIGNATURE',
          }),
        }),
      );
    });

    it('should return an auth error for an invalid signature', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Invalid signature' }),
      });

      const result = await client.wallet.verifySignature('msg', 'bad-sig');

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAuthError);
      expect(result.error?.message).toBe('Invalid signature');
    });

    it('should handle network failures gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await client.wallet.verifySignature('msg', 'sig');

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(VeylixAPIError);
      expect(result.error?.message).toBe('Connection refused');
    });
  });
});
