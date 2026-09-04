/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Maximize2, Minimize2, Grid, Activity, UploadCloud } from 'lucide-react';
import { TrackVisualConfig, TrackData, ActiveRing, SparkParticle } from '../types';
import { CanvasRenderer } from '../visualizer/canvasRenderer';

interface VisualizerCanvasProps {
  tracks: TrackData[];
  configs: TrackVisualConfig[];
  currentFrame: number;
  activeRings: ActiveRing[];
  activeParticles: SparkParticle[];
  duration?: number;
  currentTime?: number;
  onConfigChange: (trackIndex: number, newConfig: TrackVisualConfig) => void;
  onApplyLayoutPreset: (preset: 'quad' | 'center' | 'diamond' | 'horizontal') => void;
  showSpectrumHud: boolean;
  setShowSpectrumHud: (val: boolean) => void;
  canvasRefOut?: (canvas: HTMLCanvasElement | null) => void;
  canvasRendererRefOut?: (renderer: CanvasRenderer | null) => void;
  onOpenUpload?: () => void;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({
  tracks,
  configs,
  currentFrame,
  activeRings,
  activeParticles,
  onConfigChange,
  onApplyLayoutPreset,
  showSpectrumHud,
  setShowSpectrumHud,
  canvasRefOut,
  canvasRendererRefOut,
  onOpenUpload,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  const [draggingTrackId, setDraggingTrackId] = useState<number | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  // Resize handler with HiDPI support
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (!rendererRef.current) {
        rendererRef.current = new CanvasRenderer(ctx);
      }
      rendererRef.current.setDimensions(width, height, dpr);
      canvasRendererRefOut?.(rendererRef.current);
    }
  }, [canvasRendererRefOut]);

  useEffect(() => {
    handleResize();
    const ro = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }
    return () => ro.disconnect();
  }, [handleResize]);

  // Pass canvas and renderer refs outside (for direct render loop & video export)
  useEffect(() => {
    if (canvasRefOut) {
      canvasRefOut(canvasRef.current);
    }
    if (canvasRendererRefOut && rendererRef.current) {
      canvasRendererRefOut(rendererRef.current);
    }
  }, [canvasRefOut, canvasRendererRefOut]);

  // Main render update whenever frame or rings change
  useEffect(() => {
    if (!rendererRef.current || !canvasRef.current) return;
    rendererRef.current.renderFrame(
      currentFrame,
      tracks,
      configs,
      activeRings,
      activeParticles,
      {
        draggingTrackId,
        hoveredTrackId,
        showInterferenceGrid: showGrid,
        showSpectrumHud,
      }
    );
  }, [
    currentFrame,
    tracks,
    configs,
    activeRings,
    activeParticles,
    draggingTrackId,
    hoveredTrackId,
    showGrid,
    showSpectrumHud,
  ]);

  // Mouse & Touch interaction for dragging emitter nodes
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { normX: 0, normY: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const normX = Math.max(0.04, Math.min(0.96, (clientX - rect.left) / rect.width));
    const normY = Math.max(0.04, Math.min(0.96, (clientY - rect.top) / rect.height));
    return { normX, normY };
  };

  const findNearestTrack = (normX: number, normY: number, thresholdRadiusNorm = 0.08) => {
    let closestId: number | null = null;
    let minDistance = thresholdRadiusNorm;

    configs.forEach((c) => {
      const dx = c.originX - normX;
      const dy = c.originY - normY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        minDistance = dist;
        closestId = c.id;
      }
    });

    return closestId;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const { normX, normY } = getCanvasCoords(e);
    const hitId = findNearestTrack(normX, normY, 0.09);
    if (hitId !== null) {
      setDraggingTrackId(hitId);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { normX, normY } = getCanvasCoords(e);

    if (draggingTrackId !== null) {
      const trackIdx = configs.findIndex((c) => c.id === draggingTrackId);
      if (trackIdx !== -1) {
        onConfigChange(trackIdx, {
          ...configs[trackIdx],
          originX: normX,
          originY: normY,
        });
      }
    } else {
      const hovered = findNearestTrack(normX, normY, 0.08);
      setHoveredTrackId(hovered);
    }
  };

  const handlePointerUp = () => {
    setDraggingTrackId(null);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[420px] bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col"
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2">
        {/* Left: Clock and Stats Badge */}
        <div className="flex items-center gap-2 pointer-events-auto bg-neutral-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-800/90 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            ZERO-DRIFT DSP
          </span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-300">
            F#{currentFrame >= 0 ? currentFrame.toString().padStart(4, '0') : '----'}
          </span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">{activeRings.length} rings</span>
        </div>

        {/* Right: Layout Presets & View Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-neutral-900/80 backdrop-blur-md px-2 py-1.5 rounded-lg border border-neutral-800/90 text-xs">
          <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline px-1">Layout:</span>
          <button
            onClick={() => onApplyLayoutPreset('quad')}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 transition-colors"
            title="Quad Corners layout (Track 1, Track 2, Track 3, Track 4 in corners)"
          >
            Quad
          </button>
          <button
            onClick={() => onApplyLayoutPreset('center')}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 transition-colors"
            title="Concentric center layout"
          >
            Center
          </button>
          <button
            onClick={() => onApplyLayoutPreset('diamond')}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 transition-colors"
            title="Diamond layout"
          >
            Diamond
          </button>
          <button
            onClick={() => onApplyLayoutPreset('horizontal')}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 transition-colors hidden md:inline-block"
            title="Linear horizontal layout"
          >
            Linear
          </button>

          <div className="w-px h-3.5 bg-neutral-700 mx-1" />

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-1 rounded transition-colors ${
              showGrid ? 'text-cyan-400 bg-cyan-950/40' : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Toggle interference grid"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          {/* Spectrum HUD Toggle */}
          <button
            onClick={() => setShowSpectrumHud(!showSpectrumHud)}
            className={`p-1 rounded transition-colors ${
              showSpectrumHud ? 'text-amber-400 bg-amber-950/40' : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Toggle bottom spectrum HUD"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        className={`w-full h-full flex-1 touch-none ${
          draggingTrackId !== null ? 'cursor-grabbing' : hoveredTrackId !== null ? 'cursor-grab' : 'cursor-crosshair'
        }`}
      />

      {/* Upload prompt when 0 tracks are loaded */}
      {tracks.filter(Boolean).length === 0 && onOpenUpload && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/40 backdrop-blur-[2px] pointer-events-none z-20">
          <div className="bg-[#0f1015]/90 border border-neutral-700/80 rounded-2xl p-6 text-center shadow-2xl max-w-sm pointer-events-auto flex flex-col items-center">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-100 mb-1">Upload Audio to Begin</h3>
            <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
              Upload your first stem or track below. Visuals and RMS triggers will start immediately!
            </p>
            <button
              onClick={onOpenUpload}
              className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-neutral-950 text-xs font-bold rounded-lg transition-colors shadow-lg shadow-cyan-400/20 flex items-center gap-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Stems</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom overlay tip */}
      <div className="absolute bottom-2 left-3 pointer-events-none z-10 text-[10px] font-mono text-neutral-500 bg-neutral-950/70 px-2 py-0.5 rounded backdrop-blur-sm border border-neutral-900">
        <span className="text-cyan-500/80">DRAG</span> emitter nodes to reposition stem origins in real time
      </div>
    </div>
  );
};
