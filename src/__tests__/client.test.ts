import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VeylixClient } from '../client';
import { VeylixAPIError, VeylixAuthError } from '../errors';

describe('VeylixClient', () => {
  let client: VeylixClient;

  beforeEach(() => {
    client = new VeylixClient('https://mock-api.veylix.com');
    // Clear mock history before each test
    vi.restoreAllMocks();
  });

  it('should initialize with default baseUrl if not provided', () => {
    const defaultClient = new VeylixClient();
    expect(defaultClient.baseUrl).toBe('https://dapp.veylixlabs.xyz/api');
  });

  it('should initialize correctly with provided baseUrl', () => {
    expect(client.baseUrl).toBe('https://mock-api.veylix.com');
  });

  it('should successfully make a request and parse JSON', async () => {
    const mockResponse = { success: true, data: { id: 1 } };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse
    });

    const result = await client.request('/test');
    
    expect(global.fetch).toHaveBeenCalledWith('https://mock-api.veylix.com/test', expect.any(Object));
    expect(result.error).toBeNull();
    expect(result.data).toEqual(mockResponse);
  });

  it('should return VeylixAuthError on 401 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Unauthorized access' })
    });

    const result = await client.request('/secure');
    
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(VeylixAuthError);
    expect(result.error?.message).toBe('Unauthorized access');
  });

  it('should return VeylixAPIError on 500 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Server failed' })
    });

    const result = await client.request('/broken');
    
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(VeylixAPIError);
    expect(result.error?.message).toBe('Server failed');
  });
});
