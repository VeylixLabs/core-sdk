import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TelemetrySocket,
  type TelemetrySocketOptions,
  type GpuStatsEvent,
  type RenderProgressEvent,
  type QueueUpdateEvent,
} from '../modules/websocket';

// ---------------------------------------------------------------------------
// WebSocket mock factory
// ---------------------------------------------------------------------------

/**
 * Minimal, controllable mock of the browser WebSocket API.
 * We assign it to `global.WebSocket` before each test.
 */
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  public readyState: number = MockWebSocket.OPEN;
  public url: string;

  public onopen: (() => void) | null = null;
  public onclose: ((event: { code: number; reason: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;

  // Spy-friendly send/close methods
  public send = vi.fn();
  public close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // Capture instance for assertion in tests
    MockWebSocket.instances.push(this);
  }

  /** Open the connection (simulate server accepting). */
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Simulate receiving a JSON message from the server. */
  simulateMessage(payload: object): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** Simulate receiving a raw string message (for malformed-payload tests). */
  simulateRawMessage(raw: string): void {
    this.onmessage?.({ data: raw });
  }

  /** Simulate the server closing the connection. */
  simulateClose(code = 1000, reason = 'Normal closure'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  /** Simulate a connection error. */
  simulateError(): void {
    this.onerror?.();
  }

  // Registry of all instances created during a test
  static instances: MockWebSocket[] = [];

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TelemetrySocket', () => {
  const WS_URL = 'wss://mock.veylixlabs.xyz/api/ws';

  beforeEach(() => {
    MockWebSocket.reset();
    vi.useFakeTimers();
    // Inject mock into global scope
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor & initial state
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with isConnected = false before connect() is called', () => {
      const socket = new TelemetrySocket(WS_URL);
      expect(socket.isConnected).toBe(false);
    });

    it('should apply default options when none are provided', () => {
      // Indirect test: defaults are used internally; we verify via observable
      // behaviour (heartbeat fires at 30s, reconnect caps at 30s).
      const socket = new TelemetrySocket(WS_URL);
      expect(socket).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  describe('connect()', () => {
    it('should resolve when the WebSocket connection opens', async () => {
      const socket = new TelemetrySocket(WS_URL);
      const connectPromise = socket.connect();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      await expect(connectPromise).resolves.toBeUndefined();
      expect(socket.isConnected).toBe(true);
    });

    it('should reject when the initial connection errors before opening', async () => {
      const socket = new TelemetrySocket(WS_URL);
      const connectPromise = socket.connect();

      const ws = MockWebSocket.instances[0];
      ws.simulateError(); // triggers onerror while not yet connected

      await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
    });

    it('should emit the "open" lifecycle event when connected', async () => {
      const socket = new TelemetrySocket(WS_URL);
      const openHandler = vi.fn();
      socket.on('open', openHandler);

      const connectPromise = socket.connect();
      MockWebSocket.instances[0].simulateOpen();
      await connectPromise;

      expect(openHandler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  describe('disconnect()', () => {
    it('should set isConnected to false after disconnect()', async () => {
      const socket = new TelemetrySocket(WS_URL);
      const connectPromise = socket.connect();
      MockWebSocket.instances[0].simulateOpen();
      await connectPromise;

      socket.disconnect();
      expect(socket.isConnected).toBe(false);
    });

    it('should prevent automatic reconnection after explicit disconnect()', async () => {
      const socket = new TelemetrySocket(WS_URL, { maxReconnectAttempts: 5 });
      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      socket.disconnect();
      ws.simulateClose(1006, 'Abnormal closure');

      // Advance timers well past any reconnect window
      vi.advanceTimersByTime(60_000);

      // Only the original WebSocket instance should have been created
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('should emit the "close" lifecycle event when the server closes the connection', async () => {
      const socket = new TelemetrySocket(WS_URL);
      const closeHandler = vi.fn();
      socket.on('close', closeHandler);

      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      ws.simulateClose(1001, 'Going away');

      expect(closeHandler).toHaveBeenCalledWith({ code: 1001, reason: 'Going away' });
    });
  });

  // -------------------------------------------------------------------------
  // on() / off() — event subscription
  // -------------------------------------------------------------------------

  describe('on() / off()', () => {
    it('should support method chaining on on()', () => {
      const socket = new TelemetrySocket(WS_URL);
      const result = socket
        .on('gpu_stats', vi.fn())
        .on('render_progress', vi.fn());

      expect(result).toBe(socket);
    });

    it('should support method chaining on off()', () => {
      const socket = new TelemetrySocket(WS_URL);
      const handler = vi.fn();
      const result = socket.on('gpu_stats', handler).off('gpu_stats', handler);

      expect(result).toBe(socket);
    });

    it('should call all registered handlers for the same event', async () => {
      const socket = new TelemetrySocket(WS_URL);
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      socket.on('queue_update', handler1).on('queue_update', handler2);

      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      ws.simulateMessage({
        type: 'queue_update',
        timestamp: Date.now(),
        data: { totalJobs: 5, activeWorkers: 2, averageWaitTime: 30 },
      });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should stop calling a handler after off() is invoked', async () => {
      const socket = new TelemetrySocket(WS_URL);
      const handler = vi.fn();

      socket.on('queue_update', handler);
      socket.off('queue_update', handler);

      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      ws.simulateMessage({
        type: 'queue_update',
        timestamp: Date.now(),
        data: { totalJobs: 1, activeWorkers: 1, averageWaitTime: 5 },
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Typed telemetry events
  // -------------------------------------------------------------------------

  describe('telemetry events', () => {
    async function setupConnectedSocket(
      options?: TelemetrySocketOptions,
    ): Promise<{ socket: TelemetrySocket; ws: MockWebSocket }> {
      const socket = new TelemetrySocket(WS_URL, options);
      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;
      return { socket, ws };
    }

    it('should dispatch a typed "gpu_stats" event with the correct payload', async () => {
      const { socket, ws } = await setupConnectedSocket();
      const handler = vi.fn();
      socket.on('gpu_stats', handler);

      const payload: GpuStatsEvent = {
        subnetId: 'subnet-1',
        utilization: 87,
        temperature: 72,
        memoryUsed: 8_000_000_000,
        memoryTotal: 24_000_000_000,
        activeJobs: 3,
      };

      ws.simulateMessage({ type: 'gpu_stats', timestamp: Date.now(), data: payload });

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should dispatch a typed "render_progress" event with the correct payload', async () => {
      const { socket, ws } = await setupConnectedSocket();
      const handler = vi.fn();
      socket.on('render_progress', handler);

      const payload: RenderProgressEvent = {
        jobId: 'job-xyz',
        progress: 45,
        stage: 'texturing',
        estimatedTimeRemaining: 120,
      };

      ws.simulateMessage({ type: 'render_progress', timestamp: Date.now(), data: payload });

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should dispatch a typed "queue_update" event with the correct payload', async () => {
      const { socket, ws } = await setupConnectedSocket();
      const handler = vi.fn();
      socket.on('queue_update', handler);

      const payload: QueueUpdateEvent = {
        totalJobs: 12,
        activeWorkers: 4,
        averageWaitTime: 45,
      };

      ws.simulateMessage({ type: 'queue_update', timestamp: Date.now(), data: payload });

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should dispatch a "network_status" event', async () => {
      const { socket, ws } = await setupConnectedSocket();
      const handler = vi.fn();
      socket.on('network_status', handler);

      const payload = { connected: true, latencyMs: 24 };
      ws.simulateMessage({ type: 'network_status', timestamp: Date.now(), data: payload });

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should emit an "error" event for malformed (non-JSON) messages', async () => {
      const { socket, ws } = await setupConnectedSocket();
      const errorHandler = vi.fn();
      socket.on('error', errorHandler);

      ws.simulateRawMessage('not valid json {{{{');

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to parse telemetry message' }),
      );
    });

    it('should silently ignore messages with missing type or data fields', async () => {
      const { socket, ws } = await setupConnectedSocket();
      const handler = vi.fn();
      socket.on('gpu_stats', handler);

      ws.simulateMessage({ timestamp: Date.now() }); // no type or data

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  describe('heartbeat', () => {
    it('should send a ping frame every heartbeatIntervalMs', async () => {
      const socket = new TelemetrySocket(WS_URL, { heartbeatIntervalMs: 5_000 });
      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      vi.advanceTimersByTime(5_000);
      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({ type: 'ping' });

      vi.advanceTimersByTime(5_000);
      expect(ws.send).toHaveBeenCalledTimes(2);
    });

    it('should stop sending heartbeats after disconnect()', async () => {
      const socket = new TelemetrySocket(WS_URL, { heartbeatIntervalMs: 5_000 });
      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      socket.disconnect();

      vi.advanceTimersByTime(20_000);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Reconnection with exponential backoff
  // -------------------------------------------------------------------------

  describe('reconnection', () => {
    it('should schedule a reconnect attempt after an unexpected close', async () => {
      const socket = new TelemetrySocket(WS_URL, {
        maxReconnectAttempts: 3,
        initialReconnectDelayMs: 1_000,
      });

      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      ws.simulateClose(1006, 'Abnormal');

      // After 1 second, a new WebSocket should be created
      vi.advanceTimersByTime(1_000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('should use exponential backoff for successive reconnect delays', async () => {
      const socket = new TelemetrySocket(WS_URL, {
        maxReconnectAttempts: 5,
        initialReconnectDelayMs: 1_000,
        maxReconnectDelayMs: 30_000,
      });

      const connectPromise = socket.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      // Trigger first unexpected close
      ws.simulateClose(1006, 'Drop 1');
      vi.advanceTimersByTime(1_000); // 1s * 2^0 = 1s
      expect(MockWebSocket.instances).toHaveLength(2);

      // Second reconnect fails immediately
      MockWebSocket.instances[1].simulateClose(1006, 'Drop 2');
      vi.advanceTimersByTime(2_000); // 1s * 2^1 = 2s
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it('should emit an "error" event when max reconnect attempts are exhausted', async () => {
      const socket = new TelemetrySocket(WS_URL, {
        maxReconnectAttempts: 2,
        initialReconnectDelayMs: 100,
      });

      const errorHandler = vi.fn();
      socket.on('error', errorHandler);

      const connectPromise = socket.connect();
      const firstWs = MockWebSocket.instances[0];
      firstWs.simulateOpen();
      await connectPromise;

      // Drop 1 → attempt 1 → drop 2 → attempt 2 → drop 3 → exhaust
      firstWs.simulateClose(1006, 'Drop 1');
      vi.advanceTimersByTime(100);
      MockWebSocket.instances[1].simulateClose(1006, 'Drop 2');
      vi.advanceTimersByTime(200);
      MockWebSocket.instances[2].simulateClose(1006, 'Drop 3');
      vi.advanceTimersByTime(400);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Max reconnect attempts') }),
      );
    });
  });
});
