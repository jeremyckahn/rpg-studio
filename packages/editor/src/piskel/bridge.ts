import { z } from 'zod';
import { TextureManager } from '@rpgstudio/engine';

export const PiskelMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PISKEL_READY'),
  }),
  z.object({
    type: z.literal('PISKEL_OPEN_SPRITE'),
    spriteId: z.string(),
    piskelData: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('PISKEL_SAVE_SPRITE'),
    spriteId: z.string(),
    pngDataUrl: z.string().startsWith('data:image/png;base64,'),
    piskelData: z.unknown(),
  }),
]);
export type PiskelMessage = z.infer<typeof PiskelMessageSchema>;

export interface PiskelBridgeOptions {
  readonly onSave: (spriteId: string, pngDataUrl: string, piskelData: unknown) => void | Promise<void>;
  readonly targetOrigin?: string;
}

export const setupPiskelBridge = (
  _iframeWindow: Window | null,
  options: PiskelBridgeOptions
): (() => void) => {
  const handleMessage = async (event: MessageEvent) => {
    // If targetOrigin is specified and not wildcard, check origin
    if (options.targetOrigin && options.targetOrigin !== '*' && event.origin !== options.targetOrigin) {
      return;
    }

    const parseResult = PiskelMessageSchema.safeParse(event.data);
    if (!parseResult.success) {
      return;
    }

    const message = parseResult.data;
    if (message.type === 'PISKEL_SAVE_SPRITE') {
      // Live hot-reloading: purge cached texture from Pixi Assets
      await TextureManager.getInstance().invalidateTexture(message.spriteId);

      // Invoke save callback to persist png / metadata
      await options.onSave(message.spriteId, message.pngDataUrl, message.piskelData);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', handleMessage);
    }
  };
};

export const sendOpenSpriteToPiskel = (
  iframeWindow: Window,
  spriteId: string,
  piskelData?: unknown,
  targetOrigin = '*'
): void => {
  iframeWindow.postMessage(
    {
      type: 'PISKEL_OPEN_SPRITE',
      spriteId,
      piskelData,
    },
    targetOrigin
  );
};
