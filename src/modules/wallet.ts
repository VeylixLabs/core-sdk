import type { VeylixClient } from '../client';
import type { ApiResponse } from '../errors';

export interface SiwePayload {
  nonce: string;
  message: string;
}

export class WalletModule {
  private client: VeylixClient;

  constructor(client: VeylixClient) {
    this.client = client;
  }

  /**
   * Generates a SIWE (Sign-In with Ethereum) payload including the nonce
   * required to securely authenticate a wallet address against the VEYLIX dApp backend.
   */
  public async generateSiwePayload(address: string, chainId: number = 8453): Promise<ApiResponse<SiwePayload>> {
    return this.client.request<SiwePayload>(`/auth/siwe/nonce`, {
      method: 'POST',
      body: JSON.stringify({ address, chainId }),
    });
  }

  /**
   * Verifies the signed SIWE message signature with the backend to establish a session.
   */
  public async verifySignature(message: string, signature: string): Promise<ApiResponse<{ token: string; user: any }>> {
    return this.client.request<{ token: string; user: any }>(`/auth/siwe/verify`, {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    });
  }
}
