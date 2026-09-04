/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Upload, Sliders, Move, Sparkles, Zap } from 'lucide-react';
import { TrackData, TrackVisualConfig, RingShape } from '../types';

interface TrackCardProps {
  trackIndex: number;
  config: TrackVisualConfig;
  trackData?: TrackData;
  onConfigChange: (newConfig: TrackVisualConfig) => void;
  onFileUpload: (file: File) => void;
  isProcessing?: boolean;
}

const SHAPE_OPTIONS: { id: RingShape; label: string }[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'star', label: 'Star' },
  { id: 'flower', label: 'Flower' },
  { id: 'diamond', label: 'Diamond' },
];

const PRESET_COLORS = [
  { color: '#00f0ff', glow: '#00b8ff', label: 'Cyan' },
  { color: '#ff007f', glow: '#c400ff', label: 'Magenta' },
  { color: '#ffbe0b', glow: '#fb5607', label: 'Solar Gold' },
  { color: '#00ff88', glow: '#05ffa1', label: 'Neon Lime' },
  { color: '#7928ca', glow: '#ff0080', label: 'Violet' },
  { color: '#ff5400', glow: '#ff0054', label: 'Flame' },
];

export const TrackCard: React.FC<TrackCardProps> = ({
  trackIndex,
  config,
  trackData,
  onConfigChange,
  onFileUpload,
  isProcessing,
}) => {
  const handleMuteToggle = () => {
    onConfigChange({ ...config, muted: !config.muted });
  };

  const handleSoloToggle = () => {
    onConfigChange({ ...config, solo: !config.solo });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, volume: parseFloat(e.target.value) });
  };

  const handleMaxRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, maxRadius: parseInt(e.target.value, 10) });
  };

  const handleShapeChange = (shape: RingShape) => {
    onConfigChange({ ...config, shape });
  };

  const handleColorSelect = (color: string, glow: string) => {
    onConfigChange({ ...config, color, glowColor: glow });
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, threshold: parseFloat(e.target.value) });
  };

  const handleCooldownChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, cooldown: parseInt(e.target.value, 10) });
  };

  const handleOriginChange = (axis: 'originX' | 'originY', val: number) => {
    onConfigChange({ ...config, [axis]: val });
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-200 p-4 ${
        config.muted
          ? 'bg-neutral-900/60 border-neutral-800 opacity-60'
          : config.solo
          ? 'bg-neutral-900/95 border-amber-500/70 shadow-lg shadow-amber-500/10'
          : 'bg-neutral-900/90 border-neutral-800 hover:border-neutral-700'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: config.color, boxShadow: `0 0 10px ${config.glowColor}` }}
          />
          <div className="truncate">
            <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2 truncate">
              <span>{config.name}</span>
              <span className="text-[11px] font-mono text-neutral-400 font-normal">
                [Trk {trackIndex + 1}]
              </span>
            </h3>
            <p className="text-[11px] text-neutral-400 truncate">
              {trackData ? `${trackData.fileName} (${trackData.numFrames}f)` : 'No stem loaded'}
            </p>
          </div>
        </div>

        {/* Mute & Solo buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleMuteToggle}
            className={`w-7 h-7 rounded text-xs font-mono font-bold transition-colors ${
              config.muted
                ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700'
            }`}
            title="Mute track"
          >
            M
          </button>
          <button
            onClick={handleSoloToggle}
            className={`w-7 h-7 rounded text-xs font-mono font-bold transition-colors ${
              config.solo
                ? 'bg-amber-500/30 text-amber-400 border border-amber-500/60'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700'
            }`}
            title="Solo track"
          >
            S
          </button>
        </div>
      </div>

      {/* Primary Controls: Volume & Origin Coordinates */}
      <div className="space-y-3 pt-1 border-t border-neutral-800/80">
        {/* Volume Slider */}
        <div className="flex items-center gap-2">
          {config.volume === 0 || config.muted ? (
            <VolumeX className="w-4 h-4 text-neutral-500 shrink-0" />
          ) : (
            <Volume2 className="w-4 h-4 text-neutral-400 shrink-0" />
          )}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={config.volume}
            onChange={handleVolumeChange}
            className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <span className="text-[11px] font-mono text-neutral-400 w-9 text-right">
            {Math.round(config.volume * 100)}%
          </span>
        </div>

        {/* Origin Coordinates */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 bg-neutral-950/60 px-2 py-1.5 rounded border border-neutral-800/80">
            <Move className="w-3 h-3 text-neutral-500 shrink-0" />
            <span className="text-neutral-400">X:</span>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={config.originX}
              onChange={(e) => handleOriginChange('originX', parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300"
            />
            <span className="text-neutral-300 w-7 text-right">{Math.round(config.originX * 100)}%</span>
          </div>
          <div className="flex items-center gap-1.5 bg-neutral-950/60 px-2 py-1.5 rounded border border-neutral-800/80">
            <Move className="w-3 h-3 text-neutral-500 shrink-0" />
            <span className="text-neutral-400">Y:</span>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={config.originY}
              onChange={(e) => handleOriginChange('originY', parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300"
            />
            <span className="text-neutral-300 w-7 text-right">{Math.round(config.originY * 100)}%</span>
          </div>
        </div>

        {/* Shape and Max Radius */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1">
            {SHAPE_OPTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => handleShapeChange(s.id)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                  config.shape === s.id
                    ? 'bg-neutral-800 text-cyan-300 border border-cyan-500/40'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleColorSelect(p.color, p.glow)}
                className={`w-4 h-4 rounded-full transition-transform ${
                  config.color === p.color ? 'scale-125 ring-2 ring-white/60' : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: p.color }}
                title={p.label}
              />
            ))}
          </div>
        </div>

        {/* Ring Radius Control */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-400">
          <div className="flex items-center gap-2">
            <span>Ring Radius:</span>
            <input
              type="range"
              min="60"
              max="280"
              step="10"
              value={config.maxRadius}
              onChange={handleMaxRadiusChange}
              className="w-24 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300"
            />
            <span className="font-mono text-neutral-300">{config.maxRadius}px</span>
          </div>
        </div>

        {/* RMS Trigger Threshold & Cooldown */}
        <div className="pt-2 border-t border-neutral-800/80 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-neutral-300">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>RMS Trigger Threshold</span>
            </div>
            <span className="font-mono text-cyan-300 font-semibold">
              {Math.round((config.threshold ?? 0.35) * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-500">0%</span>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={config.threshold ?? 0.35}
              onChange={handleThresholdChange}
              className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-[10px] font-mono text-neutral-500">100%</span>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-0.5">
            <span>Trigger Cooldown:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min="40"
                max="300"
                step="10"
                value={config.cooldown ?? 100}
                onChange={handleCooldownChange}
                className="w-20 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300"
              />
              <span className="text-neutral-300 w-12 text-right">{config.cooldown ?? 100}ms</span>
            </div>
          </div>
        </div>

        {/* File upload/replace button */}
        <div className="pt-1">
          <label className="flex items-center justify-center gap-2 w-full py-1.5 px-3 rounded-lg border border-dashed border-neutral-700/80 hover:border-cyan-500/80 hover:bg-cyan-950/20 text-[11px] text-neutral-400 hover:text-cyan-300 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>
              {isProcessing
                ? 'Processing stem...'
                : trackData
                ? 'Replace stem audio'
                : `Upload ${config.name} track`}
            </span>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aif,.aiff"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileUpload(f);
              }}
              className="hidden"
              disabled={isProcessing}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
