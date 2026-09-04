/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, UploadCloud, FileAudio, Check, AlertCircle } from 'lucide-react';
import { TrackVisualConfig } from '../types';

interface StemUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  configs: TrackVisualConfig[];
  onUploadStems: (files: { [trackIndex: number]: File }) => void;
  isProcessing?: boolean;
}

export const StemUploadModal: React.FC<StemUploadModalProps> = ({
  isOpen,
  onClose,
  configs,
  onUploadStems,
  isProcessing,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<{ [trackIndex: number]: File }>({});
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isOpen) return null;

  const handleSlotFileChange = (trackIndex: number, file: File) => {
    setSelectedFiles((prev) => ({
      ...prev,
      [trackIndex]: file,
    }));
  };

  const handleDropBatch = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const rawFiles: File[] = Array.from(e.dataTransfer.files);
    const files: File[] = rawFiles.filter((f: File) =>
      f.type.startsWith('audio/') || /\.(wav|mp3|flac|ogg|m4a|aac|aif|aiff)$/i.test(f.name)
    );

    if (files.length === 0) return;

    // Automatically map files by filename numbers, keywords, or sequential slot
    const mapped: { [trackIndex: number]: File } = {};
    const unmapped: File[] = [];

    files.forEach((file: File) => {
      const lower = file.name.toLowerCase();
      if (lower.includes('track 1') || lower.includes('track1') || lower.includes('track_1') || lower.includes('stem 1') || lower.includes('drum') || lower.includes('beat')) {
        if (!mapped[0]) mapped[0] = file;
        else unmapped.push(file);
      } else if (lower.includes('track 2') || lower.includes('track2') || lower.includes('track_2') || lower.includes('stem 2') || lower.includes('bass') || lower.includes('sub')) {
        if (!mapped[1]) mapped[1] = file;
        else unmapped.push(file);
      } else if (lower.includes('track 3') || lower.includes('track3') || lower.includes('track_3') || lower.includes('stem 3') || lower.includes('vocal') || lower.includes('lead')) {
        if (!mapped[2]) mapped[2] = file;
        else unmapped.push(file);
      } else if (lower.includes('track 4') || lower.includes('track4') || lower.includes('track_4') || lower.includes('stem 4') || lower.includes('synth') || lower.includes('chord')) {
        if (!mapped[3]) mapped[3] = file;
        else unmapped.push(file);
      } else {
        unmapped.push(file);
      }
    });

    // Fill remaining empty slots with unmapped files in order
    unmapped.forEach((file) => {
      for (let slot = 0; slot < 4; slot++) {
        if (!mapped[slot] && !selectedFiles[slot]) {
          mapped[slot] = file;
          break;
        }
      }
    });

    setSelectedFiles((prev) => ({ ...prev, ...mapped }));
  };

  const handleProcess = () => {
    onUploadStems(selectedFiles);
    onClose();
  };

  const fileCount = Object.keys(selectedFiles).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-neutral-100">Load 4 Audio Stems</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drag & Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDropBatch}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            isDragOver
              ? 'border-cyan-400 bg-cyan-950/20'
              : 'border-neutral-700 bg-neutral-950/50 hover:border-neutral-600'
          }`}
        >
          <UploadCloud className="w-8 h-8 text-neutral-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-neutral-200">
            Drag and drop up to 4 audio files here (WAV, MP3, FLAC, OGG, M4A, AIFF)
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Assigns audio files to Track 1, Track 2, Track 3, and Track 4
          </p>
        </div>

        {/* 4 Individual Stem Slots */}
        <div className="space-y-2.5">
          <span className="text-xs font-mono text-neutral-400">ASSIGN STEMS TO TRACKS:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {configs.map((config, idx) => {
              const file = selectedFiles[idx];
              return (
                <div
                  key={config.id}
                  className="bg-neutral-950/80 border border-neutral-800 p-3 rounded-xl flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: config.color }}
                    />
                    <div className="truncate">
                      <p className="text-xs font-semibold text-neutral-200 truncate">
                        {config.name}
                      </p>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {file ? file.name : 'Click to select audio...'}
                      </p>
                    </div>
                  </div>

                  <label className="shrink-0 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-mono cursor-pointer border border-neutral-700">
                    {file ? 'Change' : 'Browse'}
                    <input
                      type="file"
                      accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aif,.aiff"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleSlotFileChange(idx, f);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={fileCount === 0 || isProcessing}
            className="px-4 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 text-xs font-bold transition-colors disabled:opacity-40 shadow-lg shadow-cyan-400/20"
          >
            Process & Run DSP ({fileCount} Stems)
          </button>
        </div>
      </div>
    </div>
  );
};
