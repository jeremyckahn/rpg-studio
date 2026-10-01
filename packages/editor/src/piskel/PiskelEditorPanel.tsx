import React, { useRef, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { setupPiskelBridge, sendOpenSpriteToPiskel } from './bridge.js';

export interface PiskelEditorPanelProps {
  readonly activeSpriteId?: string;
  readonly activePiskelData?: unknown;
  readonly onSaveSprite?: (spriteId: string, pngDataUrl: string, piskelData: unknown) => void;
}

export const PiskelEditorPanel: React.FC<PiskelEditorPanelProps> = ({
  activeSpriteId = 'hero_walk',
  activePiskelData,
  onSaveSprite,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const cleanup = setupPiskelBridge(iframeRef.current?.contentWindow ?? null, {
      onSave: (spriteId, pngDataUrl, piskelData) => {
        if (onSaveSprite) {
          onSaveSprite(spriteId, pngDataUrl, piskelData);
        }
      },
    });

    return () => {
      cleanup();
    };
  }, [onSaveSprite]);

  const handleIframeLoad = () => {
    if (iframeRef.current?.contentWindow) {
      sendOpenSpriteToPiskel(
        iframeRef.current.contentWindow,
        activeSpriteId,
        activePiskelData
      );
    }
  };

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 1, bgcolor: '#252526', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Embedded Sprite Editor (Piskel Suite) — Editing: <strong>{activeSpriteId}</strong>
        </Typography>
      </Box>
      <Box sx={{ flexGrow: 1, position: 'relative' }}>
        <iframe
          ref={iframeRef}
          title="Piskel Sprite Editor"
          src="about:blank"
          onLoad={handleIframeLoad}
          style={{ width: '100%', height: '100%', border: 'none' }}
          sandbox="allow-scripts allow-same-origin allow-downloads"
        />
      </Box>
    </Box>
  );
};
