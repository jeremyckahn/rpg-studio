import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box } from '@mui/material';
import type { Tilemap } from '@rpgstudio/core';
import type { MapEditorTool } from '../store/slices/editorUi.js';

export interface MapCanvasProps {
  readonly map: Tilemap | null;
  readonly selectedLayerIndex: number;
  readonly selectedTileId: number;
  readonly selectedTool: MapEditorTool;
  readonly onSetTile: (x: number, y: number, tileId: number) => void;
  readonly onFillTiles?: (layerIndex: number, startX: number, startY: number, tileId: number) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  map,
  selectedLayerIndex: _selectedLayerIndex,
  selectedTileId,
  selectedTool,
  onSetTile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [lastMouse, setLastMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);

  const tileSize = (map?.tileSize ?? 32) * zoom;

  // Render canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Map bounds
    const mapPixelWidth = map.width * tileSize;
    const mapPixelHeight = map.height * tileSize;

    ctx.fillStyle = '#222222';
    ctx.fillRect(pan.x, pan.y, mapPixelWidth, mapPixelHeight);

    // Render tile layers
    for (let lIdx = 0; lIdx < map.layers.length; lIdx++) {
      const layer = map.layers[lIdx];
      if (!layer || !layer.visible) continue;

      ctx.globalAlpha = layer.opacity;

      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tileId = layer.data[y * map.width + x];
          if (!tileId || tileId <= 0) continue;

          // Simple colored tile visualization for map editor preview
          const tileColors = ['#4caf50', '#2196f3', '#ff9800', '#795548', '#9c27b0', '#e91e63', '#00bcd4', '#ffeb3b'];
          ctx.fillStyle = tileColors[(tileId - 1) % tileColors.length] ?? '#888888';
          ctx.fillRect(pan.x + x * tileSize, pan.y + y * tileSize, tileSize, tileSize);
        }
      }
    }

    ctx.globalAlpha = 1.0;

    // Draw grid lines
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    for (let x = 0; x <= map.width; x++) {
      ctx.beginPath();
      ctx.moveTo(pan.x + x * tileSize, pan.y);
      ctx.lineTo(pan.x + x * tileSize, pan.y + mapPixelHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.beginPath();
      ctx.moveTo(pan.x, pan.y + y * tileSize);
      ctx.lineTo(pan.x + mapPixelWidth, pan.y + y * tileSize);
      ctx.stroke();
    }

    // Hover cursor highlight
    if (hoverTile && hoverTile.x >= 0 && hoverTile.x < map.width && hoverTile.y >= 0 && hoverTile.y < map.height) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(pan.x + hoverTile.x * tileSize, pan.y + hoverTile.y * tileSize, tileSize, tileSize);
    }
  }, [map, pan, zoom, tileSize, hoverTile]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.shiftKey) {
      // Pan with middle click or Shift + click
      setIsPanning(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!map) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left - pan.x;
    const mouseY = e.clientY - rect.top - pan.y;

    const tileX = Math.floor(mouseX / tileSize);
    const tileY = Math.floor(mouseY / tileSize);

    if (tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
      if (selectedTool === 'pencil') {
        onSetTile(tileX, tileY, selectedTileId);
      } else if (selectedTool === 'eraser') {
        onSetTile(tileX, tileY, 0);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!map) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left - pan.x;
    const mouseY = e.clientY - rect.top - pan.y;
    const tileX = Math.floor(mouseX / tileSize);
    const tileY = Math.floor(mouseY / tileSize);

    if (tileX !== hoverTile?.x || tileY !== hoverTile?.y) {
      setHoverTile({ x: tileX, y: tileY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((z) => Math.max(0.5, Math.min(3, z + delta)));
  };

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        style={{ width: '100%', height: '100%', display: 'block', cursor: isPanning ? 'grabbing' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />
    </Box>
  );
};
