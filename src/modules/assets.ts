import type { VeylixClient } from '../client';
import type { ApiResponse } from '../errors';

export interface AssetDetails {
  id: string;
  name: string;
  ipfsHash: string;
  creator: string;
  topologyVerified: boolean;
}

export class AssetsModule {
  private client: VeylixClient;

  constructor(client: VeylixClient) {
    this.client = client;
  }

  /**
   * Get details for a specific 3D synthetic asset.
   */
  public async getAssetDetails(assetId: string): Promise<ApiResponse<AssetDetails>> {
    return this.client.request<AssetDetails>(`/assets/${assetId}`);
  }

  /**
   * Fetch raw IPFS metadata for an asset.
   */
  public async fetchIPFSMetadata(ipfsHash: string): Promise<ApiResponse<any>> {
    // Override the base URL to call public IPFS gateway
    const originalBase = this.client.baseUrl;
    this.client.baseUrl = 'https://ipfs.io/ipfs';
    
    try {
      const response = await this.client.request<any>(`/${ipfsHash}`);
      return response;
    } finally {
      this.client.baseUrl = originalBase; // Restore
    }
  }
}
