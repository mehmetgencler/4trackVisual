/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Repeat,
  Volume2,
  VolumeX,
  Video,
  UploadCloud,
  Camera,
} from 'lucide-react';
import { TrackData } from '../types';

interface TransportBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentFrame: number;
  totalFrames: number;
  loop: boolean;
  masterVolume: number;
  tracks: TrackData[];
  onTogglePlayPause: () => void;
  onRestart: () => void;
  onSeek: (time: number) => void;
  onToggleLoop: () => void;
  onMasterVolumeChange: (vol: number) => void;
  onBatchUploadClick: () => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  isRecording: boolean;
  onExportSnapshot?: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  currentTime,
  duration,
  currentFrame,
  totalFrames,
  loop,
  masterVolume,
  tracks,
  onTogglePlayPause,
  onRestart,
  onSeek,
  onToggleLoop,
  onMasterVolumeChange,
  onBatchUploadClick,
  onStartRecord,
  onStopRecord,
  isRecording,
  onExportSnapshot,
}) => {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const displayTime = isScrubbing ? scrubValue : currentTime;
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

  const handleScrubStart = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsScrubbing(true);
    setScrubValue(parseFloat(e.target.value));
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScrubValue(parseFloat(e.target.value));
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    onSeek(scrubValue);
  };

  return (
    <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 shadow-xl space-y-2">
      {/* Top row: Progress bar / Scrubber */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-neutral-400 w-14 text-right">
          {formatTime(displayTime)}
        </span>

        <div className="relative flex-1 flex items-center group">
          {/* Track Progress Track Background */}
          <div className="absolute inset-x-0 h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-amber-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
            />
          </div>

          <input
            type="range"
            min="0"
            max={duration || 1}
            step="0.01"
            value={displayTime}
            onMouseDown={() => setIsScrubbing(true)}
            onTouchStart={() => setIsScrubbing(true)}
            onChange={handleScrubChange}
            onMouseUp={handleScrubEnd}
            onTouchEnd={handleScrubEnd}
            disabled={tracks.length === 0}
            className="relative z-10 w-full h-4 opacity-0 cursor-pointer"
          />
        </div>

        <span className="text-xs font-mono text-neutral-400 w-14">
          {formatTime(duration)}
        </span>
      </div>

      {/* Bottom row: Transport controls & actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRestart}
            disabled={tracks.filter(Boolean).length === 0}
            className="p-2 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-40"
            title="Restart to beginning"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlayPause}
            disabled={tracks.filter(Boolean).length === 0}
            className={`flex items-center justify-center w-10 h-10 rounded-full font-bold transition-all shadow-lg ${
              isPlaying
                ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-amber-400/20'
                : 'bg-cyan-400 hover:bg-cyan-300 text-neutral-950 shadow-cyan-400/20'
            } disabled:opacity-40`}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
          </button>

          <button
            onClick={onToggleLoop}
            className={`p-2 rounded-lg transition-colors border ${
              loop
                ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800/80'
                : 'bg-neutral-800 text-neutral-400 border-transparent hover:text-neutral-200'
            }`}
            title={loop ? 'Loop enabled' : 'Loop disabled'}
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Master Volume */}
          <div className="flex items-center gap-1.5 pl-2">
            {masterVolume === 0 ? (
              <VolumeX className="w-4 h-4 text-neutral-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-neutral-400" />
            )}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-200"
              title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
            />
          </div>
        </div>

        {/* Action Buttons: Batch Upload, Snapshot, Video Export */}
        <div className="flex items-center gap-2">
          {/* Batch 4-file upload button */}
          <button
            onClick={onBatchUploadClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium border border-neutral-700 transition-colors"
            title="Upload 4 stem files simultaneously"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload Stems</span>
          </button>

          {/* Snapshot PNG Export */}
          {onExportSnapshot && (
            <button
              onClick={onExportSnapshot}
              disabled={tracks.filter(Boolean).length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1a1a1c] hover:bg-[#252528] text-neutral-300 hover:text-white text-[10px] font-mono uppercase border border-[#333] transition-colors disabled:opacity-40"
              title="Export current visualizer frame as PNG snapshot"
            >
              <Camera className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">Snapshot</span>
            </button>
          )}

          {/* Video Record/Export Button */}
          <button
            onClick={isRecording ? onStopRecord : onStartRecord}
            disabled={tracks.filter(Boolean).length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase font-bold border transition-all ${
              isRecording
                ? 'bg-red-950 text-red-400 border-red-600 animate-pulse'
                : 'bg-white text-black border-white hover:bg-neutral-200'
            } disabled:opacity-40`}
            title="Export deterministic WebM video with synchronized audio"
          >
            <Video className={`w-3 h-3 ${isRecording ? 'text-red-400' : 'text-black'}`} />
            <span>{isRecording ? 'Stop & Save Video' : 'Export WebM'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
