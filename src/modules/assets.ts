import type { VeylixClient } from '../client';
import { VeylixAPIError, type ApiResponse } from '../errors';

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
   * Fetch raw IPFS metadata for an asset directly from the public IPFS gateway.
   *
   * This method uses a dedicated `fetch` call that is fully decoupled from the
   * shared `VeylixClient` instance — avoiding race conditions that would occur
   * if concurrent calls mutated the shared `baseUrl`.
   *
   * @param ipfsHash - The CIDv0/CIDv1 content hash (e.g. `QmXyz...`).
   */
  public async fetchIPFSMetadata(ipfsHash: string): Promise<ApiResponse<any>> {
    const ipfsGatewayUrl = `https://ipfs.io/ipfs/${ipfsHash}`;

    try {
      const response = await fetch(ipfsGatewayUrl, {
        headers: { 'Content-Type': 'application/json' },
      });

      const contentType = response.headers.get('content-type');
      let data: any = null;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }

      if (!response.ok) {
        const message = data?.message ?? response.statusText;
        throw new VeylixAPIError(message, response.status, data);
      }

      return { data, error: null };
    } catch (error: any) {
      if (error instanceof VeylixAPIError) {
        return { data: null, error };
      }
      return {
        data: null,
        error: new VeylixAPIError(error.message ?? 'Unknown IPFS error', 500),
      };
    }
  }
}
