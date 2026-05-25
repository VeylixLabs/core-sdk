/**
 * @module websocket
 *
 * Production-grade WebSocket telemetry module for the VEYLIX SDK.
 * Provides real-time streaming of GPU statistics, render progress,
 * queue updates, and network status from the VEYLIX orchestration layer.
 *
 * Features:
 * - Fully typed event system with compile-time safety
 * - Automatic reconnection with exponential backoff
 * - Heartbeat ping to detect stale connections
 * - Clean lifecycle management (connect / disconnect / cleanup)
 *
 * @example
 * ```typescript
 * import { TelemetrySocket } from 'veylix-sdk';
 *
 * const socket = new TelemetrySocket('wss://dapp.veylixlabs.xyz/api/ws');
 *
 * socket.on('render_progress', (event) => {
 *   console.log(`Job ${event.jobId}: ${event.progress}% — ${event.stage}`);
 * });
 *
 * socket.on('error', (err) => console.error(err));
 *
 * await socket.connect();
 * ```
 */

// ---------------------------------------------------------------------------
// Telemetry event interfaces
// ---------------------------------------------------------------------------

/**
 * Base telemetry event envelope received over the WebSocket connection.
 * Every server-sent frame is expected to conform to this shape before
 * being dispatched to the appropriate typed handler.
 */
export interface TelemetryEvent {
  /** Discriminant identifying the kind of telemetry payload. */
  type: 'gpu_stats' | 'render_progress' | 'queue_update' | 'network_status';
  /** Unix epoch timestamp (milliseconds) of when the event was generated. */
  timestamp: number;
  /** Arbitrary payload data keyed by string. */
  data: Record<string, unknown>;
}

/**
 * GPU utilization statistics for a specific VEYLIX rendering subnet.
 */
export interface GpuStatsEvent {
  /** Unique identifier of the rendering subnet reporting stats. */
  subnetId: string;
  /** GPU core utilization percentage (0–100). */
  utilization: number;
  /** GPU temperature in degrees Celsius. */
  temperature: number;
  /** Currently consumed GPU memory in bytes. */
  memoryUsed: number;
  /** Total available GPU memory in bytes. */
  memoryTotal: number;
  /** Number of render jobs actively executing on this subnet. */
  activeJobs: number;
}

/**
 * Real-time progress update for an individual 3D render job.
 */
export interface RenderProgressEvent {
  /** Unique identifier of the render job. */
  jobId: string;
  /** Completion percentage (0–100). */
  progress: number;
  /** Current processing stage of the render pipeline. */
  stage: 'queued' | 'meshing' | 'texturing' | 'finalizing' | 'complete';
  /** Estimated seconds until completion, if available. */
  estimatedTimeRemaining?: number;
}

/**
 * Aggregate queue statistics across all rendering subnets.
 */
export interface QueueUpdateEvent {
  /** Total number of jobs currently enqueued. */
  totalJobs: number;
  /** Number of worker subnets actively processing jobs. */
  activeWorkers: number;
  /** Average wait time in seconds before a job begins processing. */
  averageWaitTime: number;
}

/**
 * Maps each logical event name to its corresponding payload type.
 *
 * - Telemetry events (server-sent): `gpu_stats`, `render_progress`,
 *   `queue_update`, `network_status`
 * - Lifecycle events (client-side): `open`, `close`, `error`
 */
export type TelemetryEventMap = {
  /** Fired when GPU statistics are received from a subnet. */
  gpu_stats: GpuStatsEvent;
  /** Fired when render progress is updated for a job. */
  render_progress: RenderProgressEvent;
  /** Fired when aggregate queue statistics change. */
  queue_update: QueueUpdateEvent;
  /** Fired when network connectivity status changes. */
  network_status: { connected: boolean; latencyMs: number };
  /** Fired when the WebSocket connection is successfully established. */
  open: void;
  /** Fired when the WebSocket connection is closed. */
  close: { code: number; reason: string };
  /** Fired when a WebSocket or parsing error occurs. */
  error: Error;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration options for {@link TelemetrySocket}.
 */
export interface TelemetrySocketOptions {
  /**
   * Maximum number of automatic reconnection attempts before giving up.
   * @defaultValue 10
   */
  maxReconnectAttempts?: number;

  /**
   * Interval in milliseconds between heartbeat ping frames.
   * @defaultValue 30_000
   */
  heartbeatIntervalMs?: number;

  /**
   * Maximum delay in milliseconds for exponential backoff between reconnects.
   * @defaultValue 30_000
   */
  maxReconnectDelayMs?: number;

  /**
   * Initial delay in milliseconds for the first reconnection attempt.
   * @defaultValue 1_000
   */
  initialReconnectDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Callback signature for a specific event type. */
type EventCallback<K extends keyof TelemetryEventMap> =
  TelemetryEventMap[K] extends void ? () => void : (data: TelemetryEventMap[K]) => void;

/** Type-erased listener entry stored in the internal listener map. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCallback = (...args: any[]) => void;

// ---------------------------------------------------------------------------
// TelemetrySocket
// ---------------------------------------------------------------------------

/**
 * A production-grade WebSocket client for consuming VEYLIX real-time
 * telemetry events.
 *
 * The socket automatically reconnects on unexpected disconnections using
 * exponential backoff (1 s → 2 s → 4 s → … → 30 s) and sends periodic
 * heartbeat pings to detect stale connections early.
 *
 * @example
 * ```typescript
 * const socket = new TelemetrySocket('wss://dapp.veylixlabs.xyz/api/ws', {
 *   maxReconnectAttempts: 5,
 * });
 *
 * socket.on('gpu_stats', (stats) => {
 *   console.log(`Subnet ${stats.subnetId}: ${stats.utilization}% GPU`);
 * });
 *
 * await socket.connect();
 * // … later …
 * socket.disconnect();
 * ```
 */
export class TelemetrySocket {
  // -----------------------------------------------------------------------
  // Private state
  // -----------------------------------------------------------------------

  /** WebSocket server URL. */
  private readonly url: string;

  /** Resolved configuration options. */
  private readonly options: Required<TelemetrySocketOptions>;

  /** Underlying WebSocket instance, or `null` when disconnected. */
  private ws: WebSocket | null = null;

  /** Map of event name → Set of registered callbacks. */
  private listeners: Map<string, Set<AnyCallback>> = new Map();

  /** Handle for the heartbeat interval timer. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Handle for the reconnect delay timeout. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Number of consecutive reconnection attempts already made. */
  private reconnectAttempts: number = 0;

  /** Whether the user has explicitly called {@link disconnect}. */
  private intentionalDisconnect: boolean = false;

  /** Tracks the current connection state. */
  private connected: boolean = false;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  /**
   * Create a new `TelemetrySocket` instance.
   *
   * @param url     - WebSocket server URL (e.g. `wss://dapp.veylixlabs.xyz/api/ws`).
   * @param options - Optional configuration overrides.
   */
  constructor(url: string, options: TelemetrySocketOptions = {}) {
    this.url = url;
    this.options = {
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30_000,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 30_000,
      initialReconnectDelayMs: options.initialReconnectDelayMs ?? 1_000,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Whether the WebSocket is currently in the `OPEN` state.
   *
   * @returns `true` if connected, `false` otherwise.
   */
  public get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Open a WebSocket connection to the telemetry server.
   *
   * Resolves once the connection is established, or rejects if the initial
   * connection attempt fails.
   *
   * @returns A promise that resolves when the connection is open.
   * @throws {Error} If the WebSocket fails to connect.
   *
   * @example
   * ```typescript
   * await socket.connect();
   * console.log(socket.isConnected); // true
   * ```
   */
  public connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.intentionalDisconnect = false;
      this.reconnectAttempts = 0;

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = (): void => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('open', undefined as never);
        resolve();
      };

      this.ws.onclose = (event: CloseEvent): void => {
        this.handleClose(event);
      };

      this.ws.onerror = (): void => {
        const error = new Error('WebSocket connection failed');
        if (!this.connected) {
          // First connection attempt failed – reject the promise.
          reject(error);
        }
        this.emit('error', error);
      };

      this.ws.onmessage = (event: MessageEvent): void => {
        this.handleMessage(event);
      };
    });
  }

  /**
   * Gracefully close the WebSocket connection.
   *
   * This prevents automatic reconnection and cleans up all internal
   * timers and listeners on the underlying socket.
   *
   * @example
   * ```typescript
   * socket.disconnect();
   * console.log(socket.isConnected); // false
   * ```
   */
  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.cleanup();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Register a listener for a specific telemetry or lifecycle event.
   *
   * @typeParam K - The event name (must be a key of {@link TelemetryEventMap}).
   * @param event    - Name of the event to listen for.
   * @param callback - Function to invoke when the event fires.
   * @returns `this` for method chaining.
   *
   * @example
   * ```typescript
   * socket
   *   .on('render_progress', (p) => console.log(p.progress))
   *   .on('error', (err) => console.error(err));
   * ```
   */
  public on<K extends keyof TelemetryEventMap>(
    event: K,
    callback: EventCallback<K>,
  ): this {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback as AnyCallback);
    return this;
  }

  /**
   * Remove a previously registered listener for a specific event.
   *
   * @typeParam K - The event name (must be a key of {@link TelemetryEventMap}).
   * @param event    - Name of the event.
   * @param callback - The exact callback reference that was passed to {@link on}.
   * @returns `this` for method chaining.
   *
   * @example
   * ```typescript
   * const handler = (p: RenderProgressEvent) => console.log(p.progress);
   * socket.on('render_progress', handler);
   * socket.off('render_progress', handler);
   * ```
   */
  public off<K extends keyof TelemetryEventMap>(
    event: K,
    callback: EventCallback<K>,
  ): this {
    const key = event as string;
    const set = this.listeners.get(key);
    if (set) {
      set.delete(callback as AnyCallback);
      if (set.size === 0) {
        this.listeners.delete(key);
      }
    }
    return this;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Emit an event to all registered listeners.
   *
   * @param event - Event name.
   * @param data  - Event payload.
   */
  private emit<K extends keyof TelemetryEventMap>(
    event: K,
    data: TelemetryEventMap[K],
  ): void {
    const key = event as string;
    const set = this.listeners.get(key);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(data);
      } catch {
        // Listener errors must not break the event loop.
      }
    }
  }

  /**
   * Parse and dispatch an incoming WebSocket message.
   *
   * Expects a JSON-encoded {@link TelemetryEvent} envelope. Malformed
   * messages are silently ignored (an `error` event is emitted instead).
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const parsed: TelemetryEvent = JSON.parse(
        typeof event.data === 'string' ? event.data : '',
      );

      if (parsed.type && parsed.data) {
        this.emit(
          parsed.type as keyof TelemetryEventMap,
          parsed.data as TelemetryEventMap[keyof TelemetryEventMap],
        );
      }
    } catch {
      this.emit('error', new Error('Failed to parse telemetry message'));
    }
  }

  /**
   * Handle WebSocket close events. If the closure was unexpected (i.e. not
   * triggered by {@link disconnect}), attempt to reconnect automatically.
   */
  private handleClose(event: CloseEvent): void {
    this.connected = false;
    this.stopHeartbeat();

    this.emit('close', { code: event.code, reason: event.reason });

    if (!this.intentionalDisconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   *
   * Delay formula: `min(initialDelay × 2^attempt, maxDelay)`
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit(
        'error',
        new Error(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`,
        ),
      );
      return;
    }

    const delay = Math.min(
      this.options.initialReconnectDelayMs * Math.pow(2, this.reconnectAttempts),
      this.options.maxReconnectDelayMs,
    );

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  /**
   * Execute a single reconnection attempt, attaching all necessary handlers.
   */
  private attemptReconnect(): void {
    if (this.intentionalDisconnect) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = (): void => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emit('open', undefined as never);
    };

    this.ws.onclose = (event: CloseEvent): void => {
      this.handleClose(event);
    };

    this.ws.onerror = (): void => {
      this.emit('error', new Error('WebSocket reconnection failed'));
    };

    this.ws.onmessage = (event: MessageEvent): void => {
      this.handleMessage(event);
    };
  }

  /**
   * Start the heartbeat interval that sends ping frames to the server
   * at the configured cadence.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, this.options.heartbeatIntervalMs);
  }

  /**
   * Stop the heartbeat interval timer if it is running.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Clean up all internal timers used for heartbeat and reconnection.
   */
  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
