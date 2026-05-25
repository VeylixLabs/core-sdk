import { VeylixAPIError, VeylixAuthError, ApiResponse } from './errors';
import { MarketplaceModule } from './modules/marketplace';
import { AssetsModule } from './modules/assets';

export class VeylixClient {
  public baseUrl: string;
  public marketplace: MarketplaceModule;
  public assets: AssetsModule;
  
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || "http://localhost:3000/api";
    this.marketplace = new MarketplaceModule(this);
    this.assets = new AssetsModule(this);
  }

  /**
   * Core HTTP request wrapper with uniform error handling.
   */
  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        }
      });

      const contentType = response.headers.get('content-type');
      let data: any = null;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new VeylixAuthError(data?.message || 'Authentication failed', data);
        }
        throw new VeylixAPIError(data?.message || response.statusText, response.status, data);
      }

      return { data: data as T, error: null };
    } catch (error: any) {
      if (error instanceof VeylixAPIError) {
        return { data: null, error };
      }
      return { 
        data: null, 
        error: new VeylixAPIError(error.message || 'Unknown network error', 500)
      };
    }
  }
}
