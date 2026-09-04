/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrackData, ProcessingProgress } from '../types';
import { getSharedAudioContext, resumeSharedAudioContext } from '../audio/audioContext';

/**
 * Downmixes a multi-channel AudioBuffer to a single mono AudioBuffer safely
 * using the shared AudioContext (avoiding hardware audio context exhaustion).
 */
export function downmixToMono(buffer: AudioBuffer): AudioBuffer {
  if (!buffer) {
    throw new Error('downmixToMono: Invalid or missing AudioBuffer');
  }

  const numChannels = buffer.numberOfChannels;
  if (numChannels === 1) return buffer;

  const length = Math.max(1, buffer.length);
  const sampleRate = buffer.sampleRate;
  const audioCtx = getSharedAudioContext();
  const monoBuffer = audioCtx.createBuffer(1, length, sampleRate);
  const out = monoBuffer.getChannelData(0);
  const weight = 1.0 / numChannels;

  for (let c = 0; c < numChannels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      out[i] += channelData[i] * weight;
    }
  }

  return monoBuffer;
}

/**
 * Computes deterministic 60 FPS Root Mean Square (RMS) envelope directly from the audio buffer.
 * Processes mono or stereo channels without blocking the main browser thread.
 */
export async function processTrackBuffer(
  rawBuffer: AudioBuffer,
  trackIndex: number,
  trackName: string,
  fileName: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<TrackData> {
  if (!rawBuffer || rawBuffer.length === 0) {
    throw new Error(`Audio buffer for "${fileName}" contains 0 audio samples.`);
  }

  onProgress?.({
    stage: 'decoding',
    trackIndex,
    trackName,
    percent: 15,
    detail: `Preparing audio stream for ${trackName}...`,
  });

  const numChannels = rawBuffer.numberOfChannels;
  const sampleRate = rawBuffer.sampleRate;
  const numSamples = rawBuffer.length;
  const samplesPerFrame = Math.max(1, Math.round(sampleRate / 60));
  const numFrames = Math.floor(numSamples / samplesPerFrame);

  if (numFrames <= 0) {
    throw new Error(`Audio buffer for "${fileName}" is too short (< 1 frame).`);
  }

  // Extract raw channel Float32Array references without unnecessary copies
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(rawBuffer.getChannelData(c));
  }

  const timeline = new Float32Array(numFrames);

  onProgress?.({
    stage: 'filtering',
    trackIndex,
    trackName,
    percent: 30,
    detail: `Computing 60 FPS RMS envelope for ${trackName}...`,
  });

  // Calculate 60 FPS RMS directly across audio frame windows
  if (numChannels === 1) {
    const ch0 = channels[0];
    for (let f = 0; f < numFrames; f++) {
      const start = f * samplesPerFrame;
      const end = Math.min(start + samplesPerFrame, numSamples);
      const count = end - start;
      let sumSq = 0;

      for (let i = start; i < end; i++) {
        const x = ch0[i] || 0;
        sumSq += x * x;
      }

      const rms = count > 0 && sumSq > 0 ? Math.sqrt(sumSq / count) : 0;
      timeline[f] = isFinite(rms) ? rms : 0;

      // Yield every 120 frames (~2.0s of audio) to ensure UI and event loop stay 100% responsive
      if (f > 0 && f % 120 === 0) {
        onProgress?.({
          stage: 'filtering',
          trackIndex,
          trackName,
          percent: Math.round(30 + (f / numFrames) * 50),
          detail: `Computing RMS for ${trackName} (${Math.round((f / numFrames) * 100)}%)...`,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } else {
    // Multi-channel (stereo / surround): RMS averaged across all channels
    for (let f = 0; f < numFrames; f++) {
      const start = f * samplesPerFrame;
      const end = Math.min(start + samplesPerFrame, numSamples);
      const count = end - start;
      let sumSq = 0;

      for (let c = 0; c < numChannels; c++) {
        const ch = channels[c];
        for (let i = start; i < end; i++) {
          const x = ch[i] || 0;
          sumSq += x * x;
        }
      }

      const totalSamples = count * numChannels;
      const rms = totalSamples > 0 && sumSq > 0 ? Math.sqrt(sumSq / totalSamples) : 0;
      timeline[f] = isFinite(rms) ? rms : 0;

      // Yield every 120 frames (~2.0s of audio) to ensure UI and event loop stay 100% responsive
      if (f > 0 && f % 120 === 0) {
        onProgress?.({
          stage: 'filtering',
          trackIndex,
          trackName,
          percent: Math.round(30 + (f / numFrames) * 50),
          detail: `Computing RMS for ${trackName} (${Math.round((f / numFrames) * 100)}%)...`,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  onProgress?.({
    stage: 'normalizing',
    trackIndex,
    trackName,
    percent: 85,
    detail: `Normalizing RMS dynamic range for ${trackName}...`,
  });

  // 98th-percentile dynamic range normalization for responsive transient triggers
  normalizeRmsTimeline(timeline);

  onProgress?.({
    stage: 'ready',
    trackIndex,
    trackName,
    percent: 100,
    detail: `Stem RMS envelope ready (${numFrames} frames @ 60 FPS)`,
  });

  return {
    id: trackIndex,
    name: trackName,
    fileName,
    monoBuffer: rawBuffer, // Full original AudioBuffer for rich playback
    timeline,
    numFrames,
    duration: rawBuffer.duration || numSamples / sampleRate,
    sampleRate,
  };
}

/**
 * Runs 98th-percentile peak detector independently per track RMS timeline.
 * Enforces peak = Math.max(peak, 0.001) to prevent division-by-near-zero during silence.
 * Protects against NaN values and denormals.
 */
export function normalizeRmsTimeline(timeline: Float32Array): void {
  if (!timeline || timeline.length === 0) return;

  let maxVal = 0;
  for (let f = 0; f < timeline.length; f++) {
    const v = timeline[f];
    if (isFinite(v) && v > maxVal) {
      maxVal = v;
    }
  }

  if (maxVal <= 0.00001) {
    timeline.fill(0);
    return;
  }

  // Fast percentile sampling (sample up to 4000 points to keep computation instant)
  const step = Math.max(1, Math.floor(timeline.length / 4000));
  const samples: number[] = [];
  for (let f = 0; f < timeline.length; f += step) {
    const v = timeline[f];
    if (isFinite(v)) {
      samples.push(v);
    }
  }
  samples.sort((a, b) => a - b);

  const p98Index = Math.min(Math.floor(0.98 * samples.length), samples.length - 1);
  const p98Val = samples[p98Index] ?? maxVal;
  const peak = Math.max(isFinite(p98Val) ? p98Val : 0.001, 0.001);

  for (let f = 0; f < timeline.length; f++) {
    const v = timeline[f];
    timeline[f] = isFinite(v) ? Math.min(Math.max(v / peak, 0), 1.0) : 0;
  }
}

/**
 * Determines the maximum length across loaded tracks.
 * Non-destructive: does not crop or mutate timelines.
 */
export function alignTrackLengths(tracks: (TrackData | undefined | null)[]): number {
  const validTracks = tracks.filter(
    (t): t is TrackData =>
      Boolean(t && typeof t.numFrames === 'number' && t.numFrames > 0 && t.timeline instanceof Float32Array)
  );

  if (validTracks.length === 0) return 0;
  return Math.max(...validTracks.map((t) => t.numFrames));
}

export { decodeAudioFile } from '../audio/audioDecoder';
