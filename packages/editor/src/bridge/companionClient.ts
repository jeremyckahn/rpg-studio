import type { DynamicStore } from '../store/index.js';
import {
  InboundBridgeMessageSchema,
  type OutboundBridgeMessage,
} from './protocol.js';

export interface CompanionClientOptions {
  readonly url?: string;
  readonly store: DynamicStore;
  readonly webSocketFactory?: (url: string) => WebSocket;
  readonly onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void;
}

export class EditorCompanionBridge {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly store: DynamicStore;
  private readonly webSocketFactory: (url: string) => WebSocket;
  private readonly onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void;
  private destroyed: boolean = false;

  constructor(options: CompanionClientOptions) {
    this.url = options.url ?? 'ws://localhost:8080';
    this.store = options.store;
    this.webSocketFactory =
      options.webSocketFactory ??
      ((url: string) => {
        if (typeof WebSocket !== 'undefined') {
          return new WebSocket(url);
        }
        throw new Error('WebSocket is not available in the current environment');
      });
    this.onStatusChange = options.onStatusChange;
  }

  public connect(): void {
    if (this.destroyed) return;

    if (this.onStatusChange) {
      this.onStatusChange('connecting');
    }

    try {
      this.ws = this.webSocketFactory(this.url);

      this.ws.onopen = () => {
        if (this.onStatusChange) {
          this.onStatusChange('connected');
        }
        this.send({
          type: 'HELLO',
          client: 'RPGStudioEditor',
          version: '0.1.0',
        });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        if (this.onStatusChange) {
          this.onStatusChange('disconnected');
        }
      };

      this.ws.onerror = () => {
        if (this.onStatusChange) {
          this.onStatusChange('disconnected');
        }
      };
    } catch {
      if (this.onStatusChange) {
        this.onStatusChange('disconnected');
      }
    }
  }

  public disconnect(): void {
    this.destroyed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public send(msg: OutboundBridgeMessage): void {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public handleMessage(raw: unknown): void {
    try {
      const parsedRaw = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const result = InboundBridgeMessageSchema.safeParse(parsedRaw);
      if (!result.success) {
        return;
      }

      const msg = result.data;
      if (msg.type === 'DISPATCH_ACTION') {
        // Wire received actions directly to Redux store.dispatch()
        this.store.dispatch(msg.action);
      } else if (msg.type === 'QUERY_STATE') {
        const rootState = this.store.getState();
        const projectState = rootState.project.present;

        if (msg.queryType === 'GET_ACTORS') {
          this.send({
            type: 'QUERY_RESPONSE',
            queryId: msg.queryId,
            success: true,
            result: projectState.actors,
          });
        } else if (msg.queryType === 'GET_MAP') {
          const mapId = msg.params?.mapId ? String(msg.params.mapId) : String(projectState.activeMapId);
          const map = projectState.maps[mapId] ?? null;
          this.send({
            type: 'QUERY_RESPONSE',
            queryId: msg.queryId,
            success: true,
            result: map,
          });
        } else if (msg.queryType === 'GET_FULL_STATE') {
          this.send({
            type: 'QUERY_RESPONSE',
            queryId: msg.queryId,
            success: true,
            result: projectState,
          });
        }
      }
    } catch {
      // Discard malformed messages
    }
  }
}
