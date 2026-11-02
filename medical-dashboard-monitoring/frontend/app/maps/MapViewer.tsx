'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Grid, Tag, Compass, Info, CheckCircle2 } from 'lucide-react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';

export interface MapMetadata {
  id: string;
  fileName: string;
  // Backend boleh mengembalikan null saat metadata ROS belum tersedia
  // (atau untuk peta dummy). Jangan biarkan field ini meledakkan render.
  resolution?: number;
  origin?: [number, number, number]; // [x, y, yaw]
  width?: number;
  height?: number;
  frameId: string;
  previewUrl: string;
  active: boolean;
  createdAt?: string;
  createdBy?: string;
}

export interface WaypointItem {
  id: string;
  map_id: string;
  room_code: string | null;
  name: string;
  x: number;
  y: number;
  yaw: number;
  enabled: boolean;
  created_by?: string;
  updated_at?: string;
}

// Null-safe accessors + penanda peta dummy (field meta boleh null dari backend).
const originOf = (m: MapMetadata): [number, number, number] => m.origin ?? [0, 0, 0];
const resolutionOf = (m: MapMetadata): number => m.resolution ?? 0.05;
const isDummyMap = (m: MapMetadata): boolean =>
  m.id.startsWith('DUMMY-') || m.fileName.includes('[SIMULASI]') || (!m.width && !m.height);

interface MapViewerProps {
  meta: MapMetadata;
  waypoints: WaypointItem[];
  selectedWaypointId: string | null;
  onSelectWaypoint: (wp: WaypointItem | null) => void;
  onPickCoordinate: (x: number, y: number) => void;
  robotPose?: { x: number; y: number; yaw: number } | null;
}

export default function MapViewer({
  meta,
  waypoints,
  selectedWaypointId,
  onSelectWaypoint,
  onPickCoordinate,
  robotPose,
}: MapViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { telemetry } = useApp();
  const { dict } = useLanguage();

  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Transform states
  const [scale, setScale] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  // Options
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  // Drag interaction
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load preview image via authenticated fetch
  useEffect(() => {
    let active = true;
    setImgLoaded(false);
    setLoadError(null);

    // Peta dummy tidak punya citra; langsung dianggap siap render.
    if (isDummyMap(meta)) {
      setImgLoaded(true);
      return;
    }

    const imageUrl = `/api/proxy/maps/${meta.id}/preview`;
    fetch(imageUrl, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal memuat citra peta`);
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (!active) return;
          setImgElement(img);
          setImgLoaded(true);
        };
        img.onerror = () => {
          if (!active) return;
          setLoadError('Gagal memproses file gambar peta');
        };
        img.src = objectUrl;
      })
      .catch((err) => {
        if (active) setLoadError(err.message || 'Gagal memuat peta');
      });

    return () => {
      active = false;
    };
  }, [meta.id]);

  // Fit to screen helper
  const fitToScreen = useCallback(() => {
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const canvas = canvasRef.current;
    if (!canvas || !w || !h) return;
    const padding = 40;
    const availW = canvas.clientWidth - padding * 2;
    const availH = canvas.clientHeight - padding * 2;
    const s = Math.min(availW / w, availH / h, 2.5);
    const newScale = Math.max(s, 0.2);
    setScale(newScale);
    setPanX((canvas.clientWidth - w * newScale) / 2);
    setPanY((canvas.clientHeight - h * newScale) / 2);
  }, [meta]);

  // Initial fit when image loads or dimensions change
  useEffect(() => {
    if (imgLoaded) {
      fitToScreen();
    }
  }, [imgLoaded, fitToScreen]);

  // Helper coordinate transforms
  const rosToCanvasCoords = useCallback(
    (rosX: number, rosY: number) => {
      const origin = originOf(meta);
      const dx = rosX - origin[0];
      const dy = rosY - origin[1];
      const yaw = origin[2] || 0;
      const rotDx = dx * Math.cos(-yaw) - dy * Math.sin(-yaw);
      const rotDy = dx * Math.sin(-yaw) + dy * Math.cos(-yaw);
      const gridX = rotDx / resolutionOf(meta);
      const gridY = rotDy / resolutionOf(meta);
      const imgPx = gridX;
      const imgPy = (meta.height ?? 0) - gridY;
      const screenX = panX + imgPx * scale;
      const screenY = panY + imgPy * scale;
      return { screenX, screenY, imgPx, imgPy };
    },
    [meta, panX, panY, scale]
  );

  const canvasToRosCoords = useCallback(
    (canvasX: number, canvasY: number) => {
      const imgPx = (canvasX - panX) / scale;
      const imgPy = (canvasY - panY) / scale;
      const gridX = imgPx;
      const gridY = (meta.height ?? 0) - imgPy;
      const dx = gridX * resolutionOf(meta);
      const dy = gridY * resolutionOf(meta);
      const origin = originOf(meta);
      const yaw = origin[2] || 0;
      const rosX = origin[0] + (dx * Math.cos(yaw) - dy * Math.sin(yaw));
      const rosY = origin[1] + (dx * Math.sin(yaw) + dy * Math.cos(yaw));
      return { rosX, rosY, px: Math.round(imgPx), py: Math.round(imgPy) };
    },
    [meta, panX, panY, scale]
  );

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Background pattern
    ctx.fillStyle = '#0f172a'; // Deep slate dark mode for contrast
    ctx.fillRect(0, 0, rect.width, rect.height);

    const mapW = meta.width ?? 0;
    const mapH = meta.height ?? 0;
    const res = resolutionOf(meta);
    if ((imgElement && imgLoaded) || isDummyMap(meta)) {
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // Disable smoothing for crisp occupancy grid pixels when zoomed
      ctx.imageSmoothingEnabled = scale < 1.5;
      if (imgElement && imgLoaded) {
        // Peta dummy tidak punya citra; grid + border tetap digambar.
        ctx.drawImage(imgElement, 0, 0, mapW, mapH);
      }

      // 1. Metric Grid overlay (1 meter spacing)
      if (showGrid) {
        const pxPerMeter = 1.0 / res;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)'; // cyan subtle
        ctx.lineWidth = 1 / scale;

        ctx.beginPath();
        for (let x = 0; x <= mapW; x += pxPerMeter) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, mapH);
        }
        for (let y = 0; y <= mapH; y += pxPerMeter) {
          ctx.moveTo(0, y);
          ctx.lineTo(mapW, y);
        }
        ctx.stroke();

        // 5-meter major grid lines
        const pxPer5M = 5.0 / res;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        for (let x = 0; x <= mapW; x += pxPer5M) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, mapH);
        }
        for (let y = 0; y <= mapH; y += pxPer5M) {
          ctx.moveTo(0, y);
          ctx.lineTo(mapW, y);
        }
        ctx.stroke();
      }

      // Map boundary border
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(0, 0, mapW, mapH);

      ctx.restore();
    }

    // Draw Map Origin (x, y) indicator
    const origin = originOf(meta);
    const originCanvas = rosToCanvasCoords(origin[0], origin[1]);
    ctx.save();
    ctx.translate(originCanvas.screenX, originCanvas.screenY);
    ctx.strokeStyle = '#ef4444'; // X-axis Red
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(25, 0);
    ctx.stroke();
    ctx.strokeStyle = '#22c55e'; // Y-axis Green
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -25);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.font = '10px sans-serif';
    ctx.fillText('Origin', 5, 12);
    ctx.restore();

    // Draw World (0,0) indicator if within reasonable viewport
    const worldCanvas = rosToCanvasCoords(0, 0);
    if (
      worldCanvas.screenX >= -50 &&
      worldCanvas.screenX <= rect.width + 50 &&
      worldCanvas.screenY >= -50 &&
      worldCanvas.screenY <= rect.height + 50
    ) {
      ctx.save();
      ctx.translate(worldCanvas.screenX, worldCanvas.screenY);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
      ctx.font = '9px sans-serif';
      ctx.fillText('(0,0)', 8, -4);
      ctx.restore();
    }

    // Draw Waypoints
    waypoints.forEach((wp) => {
      const isSelected = wp.id === selectedWaypointId;
      const { screenX, screenY } = rosToCanvasCoords(wp.x, wp.y);

      // Pin circle
      ctx.save();
      ctx.translate(screenX, screenY);

      // Selected pulsating ring
      if (isSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.fill();
      }

      // Base pin dot
      const pinColor = !wp.enabled ? '#64748b' : isSelected ? '#0284c7' : '#2563eb';
      ctx.fillStyle = pinColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Yaw orientation arrow
      const arrowLen = 18;
      // In canvas, angle is clockwise, and Y increases downward, so canvasAngle = -yaw
      const canvasYaw = -wp.yaw;
      const endX = Math.cos(canvasYaw) * arrowLen;
      const endY = Math.sin(canvasYaw) * arrowLen;

      ctx.strokeStyle = isSelected ? '#38bdf8' : '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrow head
      const headLen = 6;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headLen * Math.cos(canvasYaw - Math.PI / 6),
        endY - headLen * Math.sin(canvasYaw - Math.PI / 6)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headLen * Math.cos(canvasYaw + Math.PI / 6),
        endY - headLen * Math.sin(canvasYaw + Math.PI / 6)
      );
      ctx.stroke();

      // Label text
      if (showLabels) {
        ctx.font = isSelected ? 'bold 12px sans-serif' : '11px sans-serif';
        const labelText = wp.room_code ? `${wp.name} [${wp.room_code}]` : wp.name;
        const textWidth = ctx.measureText(labelText).width;

        // Label background pill
        ctx.fillStyle = isSelected ? 'rgba(2, 132, 199, 0.95)' : 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(-textWidth / 2 - 6, -26, textWidth + 12, 18);
        ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-textWidth / 2 - 6, -26, textWidth + 12, 18);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, 0, -17);
      }

      ctx.restore();
    });

    // Draw Live Robot Pose
    if (robotPose) {
      const { screenX, screenY } = rosToCanvasCoords(robotPose.x, robotPose.y);
      ctx.save();
      ctx.translate(screenX, screenY);

      // Radar pulse
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = 'rgba(14, 165, 233, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, 2 * Math.PI);
      ctx.fill();

      // Chassis
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Heading beam
      const robotYaw = -robotPose.yaw;
      const beamLen = 24;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(robotYaw) * beamLen, Math.sin(robotYaw) * beamLen);
      ctx.stroke();

      // Badge
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(-24, -32, 48, 16);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(-24, -32, 48, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEVO-01', 0, -24);

      ctx.restore();
    }

    ctx.restore();
  }, [
    imgElement,
    imgLoaded,
    scale,
    panX,
    panY,
    meta,
    waypoints,
    selectedWaypointId,
    robotPose,
    showGrid,
    showLabels,
    rosToCanvasCoords,
  ]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(Math.max(scale * zoomFactor, 0.15), 15);

    // Zoom centered on cursor
    setPanX(mouseX - (mouseX - panX) * (newScale / scale));
    setPanY(mouseY - (mouseY - panY) * (newScale / scale));
    setScale(newScale);
  };

  // Pointer down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: panX, y: panY };
  };

  // Pointer move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Track cursor coordinates
    const ros = canvasToRosCoords(mouseX, mouseY);
    setCursorPos({ x: ros.rosX, y: ros.rosY, px: ros.px, py: ros.py });

    // Handle Pan drag
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanX(panStartRef.current.x + dx);
      setPanY(panStartRef.current.y + dy);
    }
  };

  // Pointer up (handles both click detection and end of drag)
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      const dx = Math.abs(e.clientX - dragStartRef.current.x);
      const dy = Math.abs(e.clientY - dragStartRef.current.y);

      // If movement is very small (< 4px), treat as a click!
      if (dx < 4 && dy < 4) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Check if clicked near an existing waypoint (within 14px)
        let clickedWp: WaypointItem | null = null;
        for (const wp of waypoints) {
          const { screenX, screenY } = rosToCanvasCoords(wp.x, wp.y);
          const dist = Math.hypot(screenX - clickX, screenY - clickY);
          if (dist <= 14) {
            clickedWp = wp;
            break;
          }
        }

        if (clickedWp) {
          onSelectWaypoint(clickedWp);
        } else {
          // Clicked on empty space: populate coordinates for new/edit waypoint
          const { rosX, rosY } = canvasToRosCoords(clickX, clickY);
          onPickCoordinate(Number(rosX.toFixed(3)), Number(rosY.toFixed(3)));
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[580px] bg-card rounded-2xl overflow-hidden shadow-xl border border-base flex flex-col select-none"
    >
      {/* Top Controls Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 bg-elevated/90 backdrop-blur-md p-1.5 rounded-xl border border-base shadow-lg txt-main">
        <button
          id="btn-zoom-in"
          title="Zoom In"
          onClick={() => {
            setScale((s) => Math.min(s * 1.25, 15));
          }}
          className="p-2 hover:bg-accent-muted rounded-lg transition-colors"
        >
          <ZoomIn size={17} />
        </button>
        <button
          id="btn-zoom-out"
          title="Zoom Out"
          onClick={() => {
            setScale((s) => Math.max(s * 0.8, 0.15));
          }}
          className="p-2 hover:bg-accent-muted rounded-lg transition-colors"
        >
          <ZoomOut size={17} />
        </button>
        <div className="w-[1px] h-5 bg-border-base mx-0.5" />
        <button
          id="btn-fit-screen"
          title="Pas ke Layar"
          onClick={fitToScreen}
          className="p-2 hover:bg-accent-muted rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
        >
          <Maximize2 size={16} /> Fit
        </button>
        <button
          id="btn-reset-view"
          title="Reset Tampilan"
          onClick={fitToScreen}
          className="p-2 hover:bg-accent-muted rounded-lg transition-colors"
        >
          <RotateCcw size={16} />
        </button>
        <div className="w-[1px] h-5 bg-border-base mx-0.5" />
        <button
          id="btn-toggle-grid"
          title="Toggle Grid Metrik"
          onClick={() => setShowGrid(!showGrid)}
          className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-xs ${
            showGrid ? 'bg-accent-muted text-accent border border-accent/40' : 'hover:bg-accent-muted txt-sec'
          }`}
        >
          <Grid size={16} /> Grid
        </button>
        <button
          id="btn-toggle-labels"
          title="Toggle Label Waypoint"
          onClick={() => setShowLabels(!showLabels)}
          className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-xs ${
            showLabels ? 'bg-accent-muted text-accent border border-accent/40' : 'hover:bg-accent-muted txt-sec'
          }`}
        >
          <Tag size={16} /> Label
        </button>
      </div>

      {/* Top Right Badges */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 backdrop-blur-md border ${telemetry.simulated ? 'bg-warning/10 text-warning border-warning/30' : 'bg-success/15 text-success border-success/30'}`}>
          <Compass size={13} /> {telemetry.simulated ? dict.common.simulated : dict.common.live}
        </span>
        {isDummyMap(meta) ? (
          <span className="bg-warning/10 text-warning border border-warning/30 text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 backdrop-blur-md">
            <Tag size={13} /> Peta Dummy
          </span>
        ) : meta.active ? (
          <span className="bg-success/15 text-success border border-success/30 text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 backdrop-blur-md">
            <CheckCircle2 size={13} /> Peta Aktif Web
          </span>
        ) : (
          <span className="bg-elevated/80 txt-sec border border-base text-xs px-2.5 py-1 rounded-full font-medium backdrop-blur-md">
            Peta Arsip
          </span>
        )}
      </div>

      {/* Loading or Error Overlay */}
      {!imgLoaded && !loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card/80 backdrop-blur-sm txt-sec">
          <div className="w-9 h-9 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Memuat occupancy grid & preview citra...</p>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card/90 text-error p-6 text-center">
          <Info size={32} className="text-error mb-2" />
          <p className="font-semibold text-base mb-1">Gagal Menampilkan Peta</p>
          <p className="text-xs text-error/80 max-w-md">{loadError}</p>
        </div>
      )}

      {/* Interactive Canvas */}
      <canvas
        id="ros-occupancy-canvas"
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Bottom HUD Coordinates Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-card/90 backdrop-blur-md border-t border-base px-4 py-2 flex flex-wrap items-center justify-between text-xs txt-sec gap-2">
        <div className="flex items-center gap-4">
          <span className="txt-sec">
            Resolusi: <strong className="txt-main font-mono">{(meta.resolution ?? 0.05).toFixed(3)} m/px</strong>
          </span>
          <span className="txt-sec">
            Dimensi:{' '}
            <strong className="txt-main font-mono">
              {meta.width ?? 0} × {meta.height ?? 0} px
            </strong>{' '}
            ({((meta.width ?? 0) * (meta.resolution ?? 0.05)).toFixed(1)} ×{' '}
            {((meta.height ?? 0) * (meta.resolution ?? 0.05)).toFixed(1)} m)
          </span>
          <span className="txt-sec hidden sm:inline">
            Frame: <strong className="text-accent font-mono">{meta.frameId || 'map'}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {cursorPos ? (
            <div className="bg-elevated px-2.5 py-1 rounded-md border border-base font-mono text-accent flex items-center gap-3">
              <span>
                X: <strong>{cursorPos.x.toFixed(2)}m</strong>
              </span>
              <span>
                Y: <strong>{cursorPos.y.toFixed(2)}m</strong>
              </span>
              <span className="txt-sec hidden md:inline">
                Px: ({cursorPos.px}, {cursorPos.py})
              </span>
            </div>
          ) : (
            <span className="txt-sec italic">Arahkan kursor pada peta untuk membaca koordinat</span>
          )}
          <span className="txt-sec text-[11px] hidden lg:inline">
            💡 Klik titik pada peta untuk menyalin koordinat waypoint
          </span>
        </div>
      </div>
    </div>
  );
}
