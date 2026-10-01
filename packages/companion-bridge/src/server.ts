import { WebSocketServer, WebSocket } from 'ws';
import { ActorSchema, type Actor } from '@rpgstudio/core';

export interface CompanionServerOptions {
  readonly port?: number;
  readonly host?: string;
}

export interface PendingQuery {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export class CompanionServer {
  private wss: WebSocketServer | null = null;
  private readonly port: number;
  private readonly host: string;
  private activeClient: WebSocket | null = null;
  private readonly pendingQueries: Map<string, PendingQuery> = new Map();

  constructor(options: CompanionServerOptions = {}) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? 'localhost';
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port, host: this.host }, () => {
          resolve();
        });

        this.wss.on('connection', (ws) => {
          this.activeClient = ws;

          ws.on('message', (data) => {
            try {
              const parsed = JSON.parse(data.toString());
              if (parsed.type === 'QUERY_RESPONSE' && parsed.queryId) {
                const pending = this.pendingQueries.get(parsed.queryId);
                if (pending) {
                  clearTimeout(pending.timer);
                  this.pendingQueries.delete(parsed.queryId);
                  if (parsed.success) {
                    pending.resolve(parsed.result);
                  } else {
                    pending.reject(new Error(parsed.error ?? 'Query failed'));
                  }
                }
              }
            } catch {
              // Ignore malformed payloads
            }
          });

          ws.on('close', () => {
            if (this.activeClient === ws) {
              this.activeClient = null;
            }
          });
        });

        this.wss.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public async stop(): Promise<void> {
    for (const [, pending] of this.pendingQueries.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Companion server stopping'));
    }
    this.pendingQueries.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close(() => resolve());
      });
      this.wss = null;
      this.activeClient = null;
    }
  }

  public isConnected(): boolean {
    return this.activeClient !== null && this.activeClient.readyState === WebSocket.OPEN;
  }

  public dispatch(action: { type: string; payload?: unknown }): void {
    if (!this.isConnected() || !this.activeClient) {
      throw new Error('Cannot dispatch action: no active editor client connected');
    }

    const payload = JSON.stringify({
      type: 'DISPATCH_ACTION',
      action,
    });
    this.activeClient.send(payload);
  }

  public placeTile(
    mapId: string | number,
    layerIndex: number,
    tileX: number,
    tileY: number,
    tileId: number
  ): void {
    this.dispatch({
      type: 'project/setTile',
      payload: { mapId, layerIndex, tileX, tileY, tileId },
    });
  }

  public generateActor(actorInput: unknown): Actor {
    const parseResult = ActorSchema.safeParse(actorInput);
    if (!parseResult.success) {
      throw new Error(`AI generated invalid actor data: ${parseResult.error.message}`);
    }

    const actor = parseResult.data;
    this.dispatch({
      type: 'project/upsertActor',
      payload: actor,
    });
    return actor;
  }

  public async query(
    queryType: 'GET_MAP' | 'GET_ACTORS' | 'GET_FULL_STATE',
    params?: Record<string, unknown>,
    timeoutMs = 5000
  ): Promise<unknown> {
    if (!this.isConnected() || !this.activeClient) {
      throw new Error('Cannot query state: no active editor client connected');
    }

    const queryId = `query-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error(`Companion query timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingQueries.set(queryId, { resolve, reject, timer });

      const payload = JSON.stringify({
        type: 'QUERY_STATE',
        queryId,
        queryType,
        params,
      });
      this.activeClient?.send(payload);
    });
  }
}
