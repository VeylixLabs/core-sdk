import { VeylixAPIError, VeylixAuthError, ApiResponse } from './errors';
import { MarketplaceModule } from './modules/marketplace';
import { AssetsModule } from './modules/assets';
import { WalletModule } from './modules/wallet';
import { TelemetrySocket, TelemetrySocketOptions } from './modules/websocket';

/**
 * Primary client for interacting with the VEYLIX dApp API.
 *
 * Provides access to marketplace listings, 3D asset management,
 * wallet authentication, and real-time telemetry via WebSocket.
 *
 * @example
 * ```typescript
 * const client = new VeylixClient();
 * const { data } = await client.marketplace.getListings();
 * ```
 */
export class VeylixClient {
  /** Base URL for all HTTP API requests. */
  public baseUrl: string;

  /** Marketplace listing and verification operations. */
  public marketplace: MarketplaceModule;

  /** 3D asset retrieval and IPFS metadata operations. */
  public assets: AssetsModule;

  /** SIWE wallet authentication operations. */
  public wallet: WalletModule;

  /** Lazy-initialized telemetry WebSocket instance. */
  private _telemetry: TelemetrySocket | null = null;

  /**
   * Create a new VEYLIX client.
   *
   * @param baseUrl - Override the default API base URL.
   *                  Defaults to `https://dapp.veylixlabs.xyz/api`.
   */
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || 'https://dapp.veylixlabs.xyz/api';
    this.marketplace = new MarketplaceModule(this);
    this.assets = new AssetsModule(this);
    this.wallet = new WalletModule(this);
  }

  /**
   * Lazy-initialized telemetry WebSocket.
   *
   * Returns the same instance on subsequent accesses. Use
   * {@link createTelemetrySocket} if you need a fresh instance
   * with custom options.
   *
   * @returns A {@link TelemetrySocket} connected to the derived WebSocket URL.
   */
  public get telemetry(): TelemetrySocket {
    if (!this._telemetry) {
      this._telemetry = this.createTelemetrySocket();
    }
    return this._telemetry;
  }

  /**
   * Create a new {@link TelemetrySocket} instance.
   *
   * The WebSocket URL is derived from {@link baseUrl} by replacing the
   * `http(s)://` scheme with `ws(s)://` and appending `/ws`.
   *
   * @param options - Optional configuration for reconnection behaviour,
   *                  heartbeat interval, etc.
   * @returns A new, unconnected `TelemetrySocket` instance.
   *
   * @example
   * ```typescript
   * const socket = client.createTelemetrySocket({ maxReconnectAttempts: 5 });
   * await socket.connect();
   * ```
   */
  public createTelemetrySocket(options?: TelemetrySocketOptions): TelemetrySocket {
    const wsUrl = this.baseUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://') + '/ws';
    return new TelemetrySocket(wsUrl, options);
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
