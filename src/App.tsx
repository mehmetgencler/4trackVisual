/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  FileAudio,
} from 'lucide-react';
import {
  TrackData,
  TrackVisualConfig,
  ProcessingProgress,
  ActiveRing,
  SparkParticle,
} from './types';
import { processTrackBuffer, alignTrackLengths, decodeAudioFile } from './dsp/filterBank';
import { UnifiedPlaybackScheduler, SchedulerState } from './audio/playbackScheduler';
import { TriggerEngine } from './visualizer/triggerEngine';
import { CanvasRenderer } from './visualizer/canvasRenderer';
import { VideoExporter } from './visualizer/videoExporter';
import { VisualizerCanvas } from './components/VisualizerCanvas';
import { TrackCard } from './components/TrackCard';
import { TransportBar } from './components/TransportBar';
import { StemUploadModal } from './components/StemUploadModal';

// Initial default configuration strictly following the system design specification
const DEFAULT_CONFIGS: TrackVisualConfig[] = [
  {
    id: 0,
    name: 'Track 1',
    originX: 0.30,
    originY: 0.30,
    color: '#00f0ff',
    glowColor: '#00b8ff',
    threshold: 0.35,
    cooldown: 100,
    maxRadius: 180,
    shape: 'circle',
    volume: 1.0,
    muted: false,
    solo: false,
  },
  {
    id: 1,
    name: 'Track 2',
    originX: 0.70,
    originY: 0.30,
    color: '#ff007f',
    glowColor: '#c400ff',
    threshold: 0.35,
    cooldown: 100,
    maxRadius: 190,
    shape: 'hexagon',
    volume: 1.0,
    muted: false,
    solo: false,
  },
  {
    id: 2,
    name: 'Track 3',
    originX: 0.30,
    originY: 0.70,
    color: '#ffbe0b',
    glowColor: '#fb5607',
    threshold: 0.35,
    cooldown: 100,
    maxRadius: 175,
    shape: 'star',
    volume: 1.0,
    muted: false,
    solo: false,
  },
  {
    id: 3,
    name: 'Track 4',
    originX: 0.70,
    originY: 0.70,
    color: '#00ff88',
    glowColor: '#05ffa1',
    threshold: 0.35,
    cooldown: 100,
    maxRadius: 185,
    shape: 'flower',
    volume: 1.0,
    muted: false,
    solo: false,
  },
];

export default function App() {
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [configs, setConfigs] = useState<TrackVisualConfig[]>(DEFAULT_CONFIGS);
  const [schedulerState, setSchedulerState] = useState<SchedulerState>({
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    currentFrame: 0,
    duration: 0,
    totalFrames: 0,
  });

  const [activeRings, setActiveRings] = useState<ActiveRing[]>([]);
  const [activeParticles, setActiveParticles] = useState<SparkParticle[]>([]);
  const [currentFrameDisplay, setCurrentFrameDisplay] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSpectrumHud, setShowSpectrumHud] = useState(true);

  // References to audio scheduler and triggers
  const schedulerRef = useRef<UnifiedPlaybackScheduler | null>(null);
  const triggerEngineRef = useRef<TriggerEngine>(new TriggerEngine());
  const videoExporterRef = useRef<VideoExporter>(new VideoExporter());
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRendererRef = useRef<CanvasRenderer | null>(null);

  // Initialize playback scheduler
  useEffect(() => {
    const scheduler = new UnifiedPlaybackScheduler({
      onStateChange: (st) => setSchedulerState(st),
      onTrackEnded: () => {
        triggerEngineRef.current.reset();
        setActiveRings([]);
        setActiveParticles([]);
      },
      loop: true,
    });
    schedulerRef.current = scheduler;

    return () => {
      scheduler.dispose();
    };
  }, []);

  // Sync track volume, mute, and solo state to audio nodes
  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;

    const hasAnySolo = configs.some((c) => c.solo);
    configs.forEach((c, idx) => {
      let isAudible = !c.muted;
      if (hasAnySolo) {
        isAudible = c.solo;
      }
      scheduler.setTrackVolume(idx, isAudible ? c.volume : 0);
    });
  }, [configs]);

  // Main high-frequency deterministic render loop
  // Directly draws onto the canvas at 60 FPS without thrashing React component re-renders
  useEffect(() => {
    let animId: number;
    let lastReportedFrame = -1;

    const renderLoop = () => {
      const scheduler = schedulerRef.current;
      const engine = triggerEngineRef.current;
      const renderer = canvasRendererRef.current;

      if (scheduler && tracks.length > 0) {
        const frame = scheduler.getCurrentFrame();

        // Smoothly throttle the UI scrubber state update to ~20-30 FPS, preventing React fiber queue backlog
        if (Math.abs(frame - lastReportedFrame) >= 2 || !scheduler.getIsPlaying()) {
          lastReportedFrame = frame;
          setCurrentFrameDisplay(frame);
        }

        if (scheduler.getIsPlaying() && frame >= 0) {
          const audioCtx = scheduler.getAudioContext();
          const nowMs = audioCtx ? audioCtx.currentTime * 1000 : performance.now();

          // Target canvas logical dimensions for origin scaling
          const canvas = canvasElementRef.current;
          const cw = canvas ? canvas.clientWidth : 800;
          const ch = canvas ? canvas.clientHeight : 600;

          // Check trigger logic for all stems independently
          for (let i = 0; i < tracks.length; i++) {
            if (!tracks[i] || !configs[i]) continue;
            engine.updateTrackTriggers(
              i,
              frame,
              tracks[i],
              configs[i],
              nowMs,
              cw,
              ch
            );
          }

          engine.advanceLifecycle(1 / 60);
        }

        // Direct 60 FPS Canvas rendering without React reconciliation overhead
        if (renderer) {
          renderer.renderFrame(
            frame,
            tracks,
            configs,
            engine.activeRings,
            engine.activeParticles,
            {
              showInterferenceGrid: true,
              showSpectrumHud,
            }
          );
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [tracks, configs, showSpectrumHud]);

  // Handle individual track file upload
  const handleSingleTrackUpload = async (trackIndex: number, file: File) => {
    // Stop ongoing audio playback immediately to free audio thread & hardware resources
    schedulerRef.current?.stop();
    setIsProcessing(true);
    setExportError(null);
    setExportSuccess(null);
    setProcessingProgress({
      stage: 'decoding',
      trackIndex,
      trackName: configs[trackIndex]?.name || `Track ${trackIndex + 1}`,
      percent: 10,
      detail: `Decoding ${file.name}...`,
    });

    try {
      const buffer = await decodeAudioFile(file);
      const trackData = await processTrackBuffer(
        buffer,
        trackIndex,
        configs[trackIndex]?.name || `Track ${trackIndex + 1}`,
        file.name,
        setProcessingProgress
      );

      const updated = [...tracks];
      updated[trackIndex] = trackData;

      alignTrackLengths(updated);
      setTracks(updated);
      schedulerRef.current?.setTracks(updated);
      triggerEngineRef.current.reset();
      setActiveRings([]);
      setActiveParticles([]);

      // Auto start playback immediately so the user sees visuals without delay
      setTimeout(() => {
        schedulerRef.current?.play(0);
      }, 100);

      setExportSuccess(`Loaded ${file.name} — visuals active!`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      console.error(`Failed to process audio file for track ${trackIndex}:`, err);
      setExportError(err instanceof Error ? err.message : `Failed to process audio file "${file.name}"`);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  // Handle batch 4-file upload
  const handleBatchUploadStems = async (filesMap: { [trackIndex: number]: File }) => {
    const entries = Object.entries(filesMap);
    if (entries.length === 0) return;

    // Stop ongoing audio playback immediately to free audio thread & hardware resources
    schedulerRef.current?.stop();
    setIsProcessing(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const updated = [...tracks];

      for (const [key, file] of entries) {
        const trackIdx = parseInt(key, 10);
        setProcessingProgress({
          stage: 'decoding',
          trackIndex: trackIdx,
          trackName: configs[trackIdx]?.name || `Track ${trackIdx + 1}`,
          percent: 20,
          detail: `Decoding ${file.name}...`,
        });

        const buffer = await decodeAudioFile(file);
        const trackData = await processTrackBuffer(
          buffer,
          trackIdx,
          configs[trackIdx]?.name || `Track ${trackIdx + 1}`,
          file.name,
          setProcessingProgress
        );
        updated[trackIdx] = trackData;
      }

      alignTrackLengths(updated);
      setTracks(updated);
      schedulerRef.current?.setTracks(updated);
      triggerEngineRef.current.reset();
      setActiveRings([]);
      setActiveParticles([]);

      // Auto start playback immediately so visuals run
      setTimeout(() => {
        schedulerRef.current?.play(0);
      }, 100);

      setExportSuccess(`Successfully processed ${entries.length} stem file(s) — visuals active!`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      console.error('Failed to batch upload stems:', err);
      setExportError(err instanceof Error ? err.message : 'Failed to process batch stem files.');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  // Track visual configuration update handler
  const handleTrackConfigChange = (trackIndex: number, newConfig: TrackVisualConfig) => {
    const updated = [...configs];
    updated[trackIndex] = newConfig;
    setConfigs(updated);
  };

  // Layout presets
  const handleApplyLayoutPreset = (preset: 'quad' | 'center' | 'diamond' | 'horizontal') => {
    const updated = configs.map((c, i) => {
      let ox = c.originX;
      let oy = c.originY;

      if (preset === 'quad') {
        // Quad corners as recommended in 5.3
        const quadOrigins = [
          { x: 0.30, y: 0.30 },
          { x: 0.70, y: 0.30 },
          { x: 0.30, y: 0.70 },
          { x: 0.70, y: 0.70 },
        ];
        ox = quadOrigins[i].x;
        oy = quadOrigins[i].y;
      } else if (preset === 'center') {
        // Concentric center
        ox = 0.50;
        oy = 0.50;
      } else if (preset === 'diamond') {
        // Diamond
        const diamondOrigins = [
          { x: 0.50, y: 0.25 },
          { x: 0.75, y: 0.50 },
          { x: 0.50, y: 0.75 },
          { x: 0.25, y: 0.50 },
        ];
        ox = diamondOrigins[i].x;
        oy = diamondOrigins[i].y;
      } else if (preset === 'horizontal') {
        // Horizontal line
        ox = 0.20 + i * 0.20;
        oy = 0.50;
      }

      return { ...c, originX: ox, originY: oy };
    });

    setConfigs(updated);
  };

  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Video recording
  const handleStartRecord = async () => {
    const canvas = canvasElementRef.current;
    const scheduler = schedulerRef.current;
    if (!canvas || !scheduler) return;

    if (tracks.length === 0) {
      setExportError('Load stems first before exporting video.');
      return;
    }

    try {
      setExportError(null);
      setExportSuccess(null);
      setIsRecording(true);

      const audioCtx = scheduler.ensureAudioContext();
      const masterGain = scheduler.getMasterGain();

      await videoExporterRef.current.startRecording(
        canvas,
        audioCtx,
        masterGain
      );
      // Restart playback from beginning for clean synchronized recording
      scheduler.play(0);
    } catch (err) {
      console.error('Failed to start video recording:', err);
      setIsRecording(false);
      setExportError(err instanceof Error ? err.message : 'Could not initialize video recording');
    }
  };

  const handleStopRecord = async () => {
    try {
      const blob = await videoExporterRef.current.stopRecording();
      setIsRecording(false);

      if (blob.size === 0) {
        throw new Error('Exported video contains no frames or data.');
      }

      // Download recorded WebM file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stem_visualizer_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      setExportSuccess('Video export downloaded successfully!');
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      console.error('Failed to stop video recording:', err);
      setIsRecording(false);
      setExportError(err instanceof Error ? err.message : 'Failed to finalize video export');
    }
  };

  const handleExportSnapshot = () => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `stem_visualizer_frame_${currentFrameDisplay}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setExportSuccess('Visualizer frame exported as PNG!');
      setTimeout(() => setExportSuccess(null), 3000);
    } catch {
      setExportError('Failed to capture snapshot frame.');
    }
  };

  // Keyboard shortcut for Play/Pause (Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        schedulerRef.current?.togglePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E0E0E0] flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Professional Polish Header */}
      <header className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3 border-b border-[#222] bg-[#111] sticky top-0 z-30 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />
          <div className="flex items-center gap-3">
            <h1 className="text-sm sm:text-base font-bold tracking-tight uppercase font-mono text-white">
              STEM-SYNC // 4-TRACK DETERMINISTIC DSP
            </h1>
            <span className="hidden md:inline-block text-[9px] font-mono px-2 py-0.5 border border-[#333] bg-[#1a1a1a] text-neutral-400 uppercase">
              HW-CLOCK 60FPS
            </span>
          </div>
        </div>

        {/* Hardware Status Telemetry Strip */}
        <div className="flex items-center space-x-4 sm:space-x-6 text-[10px] font-mono text-neutral-400">
          <div className="flex flex-col">
            <span className="text-neutral-500 uppercase text-[9px]">Sync Mode</span>
            <span className="text-emerald-400 font-bold">SAMPLE-ACCURATE</span>
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-neutral-500 uppercase text-[9px]">Global Clock</span>
            <span className="text-white">
              {currentFrameDisplay >= 0 ? `F#${currentFrameDisplay.toString().padStart(5, '0')}` : 'PAUSED'}
            </span>
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-neutral-500 uppercase text-[9px]">Trigger Mode</span>
            <span className="text-white">STEM RMS DSP</span>
          </div>
          <div className="flex flex-col">
            <span className="text-neutral-500 uppercase text-[9px]">Status</span>
            <span className={tracks.filter(Boolean).length === 4 ? 'text-emerald-400' : tracks.filter(Boolean).length > 0 ? 'text-cyan-400' : 'text-amber-400'}>
              {tracks.filter(Boolean).length === 4
                ? 'LOCKED (4/4)'
                : tracks.filter(Boolean).length > 0
                ? `ACTIVE (${tracks.filter(Boolean).length}/4)`
                : 'NO AUDIO LOADED'}
            </span>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1 bg-[#1a1a1c] text-[10px] font-mono border border-[#333] hover:bg-[#252528] text-neutral-200 uppercase transition-colors flex items-center gap-1.5"
          >
            <FileAudio className="w-3 h-3 text-cyan-400" />
            <span>Load Stems</span>
          </button>
        </div>
      </header>

      {/* Recording in progress notification banner */}
      {isRecording && (
        <div className="bg-red-950/70 border-b border-red-700/80 px-4 py-2 text-xs font-mono text-red-200 flex items-center justify-between animate-pulse">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="font-bold">RECORDING VIDEO TO WEBM...</span>
              <span className="text-red-300 hidden sm:inline">Audio & visualizer streams active</span>
            </span>
            <button
              onClick={handleStopRecord}
              className="px-3 py-0.5 bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] uppercase transition-colors"
            >
              Stop & Save
            </button>
          </div>
        </div>
      )}

      {/* Alert / Error Banner */}
      {exportError && (
        <div className="bg-red-950/80 border-b border-red-800 px-4 py-2 text-xs font-mono text-red-300 flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>[AUDIO_ENGINE_ALERT]: {exportError}</span>
            </span>
            <button
              onClick={() => setExportError(null)}
              className="text-neutral-400 hover:text-white text-xs px-2 py-0.5 border border-red-800"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* Export Success Banner */}
      {exportSuccess && (
        <div className="bg-emerald-950/80 border-b border-emerald-800 px-4 py-2 text-xs font-mono text-emerald-300 flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>[EXPORT_SUCCESS]: {exportSuccess}</span>
            </span>
            <button
              onClick={() => setExportSuccess(null)}
              className="text-neutral-400 hover:text-white text-xs px-2 py-0.5 border border-emerald-800"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* Progress banner during DSP processing */}
      {isProcessing && processingProgress && (
        <div className="bg-[#111827] border-b border-cyan-500/30 px-4 py-2 text-xs font-mono text-cyan-300 flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>[DSP_PIPELINE]: {processingProgress.detail}</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="font-bold">{processingProgress.percent}%</span>
              <button
                onClick={() => {
                  setIsProcessing(false);
                  setProcessingProgress(null);
                }}
                className="text-neutral-400 hover:text-white text-[10px] px-2 py-0.5 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/60 transition-colors uppercase"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
        {/* Visualizer Canvas Area (Dominant visual center) */}
        <div className="h-[440px] sm:h-[500px] w-full border border-[#26262a] bg-[#050505] shadow-2xl relative">
          <VisualizerCanvas
            tracks={tracks}
            configs={configs}
            currentFrame={currentFrameDisplay}
            activeRings={activeRings}
            activeParticles={activeParticles}
            duration={schedulerState.duration}
            currentTime={schedulerState.currentTime}
            onConfigChange={handleTrackConfigChange}
            onApplyLayoutPreset={handleApplyLayoutPreset}
            showSpectrumHud={showSpectrumHud}
            setShowSpectrumHud={setShowSpectrumHud}
            canvasRefOut={(canvas) => {
              canvasElementRef.current = canvas;
            }}
            canvasRendererRefOut={(renderer) => {
              canvasRendererRef.current = renderer;
            }}
            onOpenUpload={() => setIsModalOpen(true)}
          />
        </div>

        {/* Master Playback Transport Bar */}
        <TransportBar
          isPlaying={schedulerState.isPlaying}
          currentTime={schedulerState.currentTime}
          duration={schedulerState.duration}
          currentFrame={currentFrameDisplay}
          totalFrames={schedulerState.totalFrames}
          loop={schedulerRef.current?.getLoop() ?? true}
          masterVolume={1.0}
          tracks={tracks}
          onTogglePlayPause={() => schedulerRef.current?.togglePlayPause()}
          onRestart={() => schedulerRef.current?.seek(0)}
          onSeek={(time) => schedulerRef.current?.seek(time)}
          onToggleLoop={() => {
            const current = schedulerRef.current?.getLoop() ?? true;
            schedulerRef.current?.setLoop(!current);
          }}
          onMasterVolumeChange={(vol) => schedulerRef.current?.setMasterVolume(vol)}
          onBatchUploadClick={() => setIsModalOpen(true)}
          onStartRecord={handleStartRecord}
          onStopRecord={handleStopRecord}
          onExportSnapshot={handleExportSnapshot}
          isRecording={isRecording}
        />

        {/* 4 Track Configuration Cards (Independent per-stem controls) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {configs.map((config, idx) => (
            <TrackCard
              key={config.id}
              trackIndex={idx}
              config={config}
              trackData={tracks[idx]}
              onConfigChange={(newConfig) => handleTrackConfigChange(idx, newConfig)}
              onFileUpload={(file) => handleSingleTrackUpload(idx, file)}
              isProcessing={isProcessing}
            />
          ))}
        </div>
      </main>

      {/* Studio Footer Telemetry Bar */}
      <footer className="h-10 bg-[#0A0A0B] border-t border-[#222] flex items-center justify-between px-4 sm:px-6 text-[10px] font-mono text-neutral-400">
        <div className="flex items-center space-x-4">
          <span className="text-neutral-500">ENGINE: DETERMINISTIC IIR MATRIX</span>
          <span className="hidden sm:inline text-neutral-600">|</span>
          <span className="hidden sm:inline text-neutral-400">ACTIVE RINGS: {activeRings.length}/80</span>
        </div>
        <div className="flex items-center space-x-4 sm:space-x-6">
          <div className="flex space-x-1.5">
            <span className="text-neutral-500">RMS_FRAMING:</span>
            <span className="text-white">16.6ms (60 FPS)</span>
          </div>
          <div className="flex space-x-1.5">
            <span className="text-neutral-500">DRIFT_CORR:</span>
            <span className="text-emerald-400 font-bold">0.0ms</span>
          </div>
        </div>
      </footer>

      {/* Stem Upload Modal */}
      <StemUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        configs={configs}
        onUploadStems={handleBatchUploadStems}
        isProcessing={isProcessing}
      />
    </div>
  );
}
