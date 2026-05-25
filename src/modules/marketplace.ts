import type { VeylixClient } from '../client';
import type { ApiResponse } from '../errors';

export interface Listing {
  id: string;
  assetId: string;
  seller: string;
  price: string;
  isActive: boolean;
}

export class MarketplaceModule {
  private client: VeylixClient;

  constructor(client: VeylixClient) {
    this.client = client;
  }

  /**
   * Fetch active marketplace listings.
   */
  public async getListings(limit: number = 10): Promise<ApiResponse<Listing[]>> {
    return this.client.request<Listing[]>(`/marketplace/listings?limit=${limit}`);
  }

  /**
   * Verify an asset's integrity on the marketplace before purchase.
   */
  public async verifyAsset(assetId: string): Promise<ApiResponse<{ verified: boolean; signature: string }>> {
    return this.client.request<{ verified: boolean; signature: string }>(`/marketplace/verify`, {
      method: 'POST',
      body: JSON.stringify({ assetId }),
    });
  }
}
