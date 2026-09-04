/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrackData } from '../types';
import { getSharedAudioContext } from './audioContext';
import { logger } from '../diagnostics/logger';

export interface SchedulerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  currentFrame: number;
  duration: number;
  totalFrames: number;
}

export class UnifiedPlaybackScheduler {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackGains: (GainNode | undefined)[] = [];
  private trackAnalysers: (AnalyserNode | undefined)[] = [];
  private sources: AudioBufferSourceNode[] = [];

  private processedTracks: (TrackData | undefined)[] = [];
  private playbackStartTime = 0;
  private pausedAtOffset = 0;
  private isPlaying = false;
  private totalFrames = 0;
  private duration = 0;
  private loop = true;
  private fps = 60;
  private trackVolumes: number[] = [1, 1, 1, 1];
  private trackMutes: boolean[] = [false, false, false, false];

  private onStateChange?: (state: SchedulerState) => void;
  private onTrackEnded?: () => void;

  constructor(options?: {
    onStateChange?: (state: SchedulerState) => void;
    onTrackEnded?: () => void;
    loop?: boolean;
  }) {
    this.onStateChange = options?.onStateChange;
    this.onTrackEnded = options?.onTrackEnded;
    if (options?.loop !== undefined) this.loop = options.loop;
  }

  private initAudioContext(): AudioContext {
    this.ctx = getSharedAudioContext();
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setTracks(tracks: (TrackData | undefined | null)[]) {
    this.stop();
    this.processedTracks = [tracks[0] || undefined, tracks[1] || undefined, tracks[2] || undefined, tracks[3] || undefined];
    this.pausedAtOffset = 0;

    const validTracks = this.processedTracks.filter(
      (t): t is TrackData => Boolean(t && t.monoBuffer && typeof t.numFrames === 'number' && t.numFrames > 0)
    );

    if (validTracks.length > 0) {
      const maxFrames = Math.max(...validTracks.map((t) => t.numFrames));
      this.totalFrames = maxFrames;
      this.duration = maxFrames / this.fps;
      logger.info(
        'SCHEDULER',
        `Mounted ${validTracks.length} active stem(s) into playback scheduler (${this.totalFrames} frames, ${this.duration.toFixed(2)}s)`
      );
    } else {
      this.totalFrames = 0;
      this.duration = 0;
      logger.info('SCHEDULER', 'All tracks cleared from scheduler');
    }
  }

  public async play(offsetSeconds?: number) {
    const hasAnyTrack = this.processedTracks.some(
      (t) => t && t.monoBuffer && typeof t.numFrames === 'number' && t.numFrames > 0
    );
    if (!hasAnyTrack) return;

    const ctx = this.initAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await Promise.race([
          ctx.resume(),
          new Promise((resolve) => setTimeout(resolve, 80)),
        ]);
      } catch (err) {
        logger.warn('SCHEDULER', 'AudioContext playback resume waiting for user gesture', { err: String(err) });
      }
    }

    // Stop any existing sources cleanly
    this.cleanupSources();

    const startOffset = Math.max(
      0,
      offsetSeconds !== undefined ? offsetSeconds : this.pausedAtOffset
    );

    // Safeguard bounds
    const safeOffset = startOffset >= this.duration ? 0 : startOffset;
    this.pausedAtOffset = safeOffset;

    // Schedule simultaneous start with a 200ms lookahead
    const startTime = ctx.currentTime + 0.2;
    this.playbackStartTime = startTime - safeOffset;

    this.sources = [];
    this.trackGains = new Array(4).fill(undefined);
    this.trackAnalysers = new Array(4).fill(undefined);

    // Find track slot with maximum duration to accurately govern end-of-track & looping
    let longestSlot = -1;
    let maxDur = -1;
    this.processedTracks.forEach((t, idx) => {
      if (t?.monoBuffer && t.monoBuffer.duration > maxDur) {
        maxDur = t.monoBuffer.duration;
        longestSlot = idx;
      }
    });

    this.processedTracks.forEach((track, slotIndex) => {
      if (!track || !track.monoBuffer) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = track.monoBuffer;

        // Track Gain
        const gainNode = ctx.createGain();
        const initialGain = this.trackMutes[slotIndex] ? 0 : (this.trackVolumes[slotIndex] ?? 1.0);
        gainNode.gain.value = Math.max(0, Math.min(1, initialGain));

        // Track Analyser (for live oscilloscope / meter)
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;

        src.connect(gainNode);
        gainNode.connect(analyser);
        if (this.masterGain) {
          analyser.connect(this.masterGain);
        }

        if (safeOffset < track.monoBuffer.duration) {
          src.start(startTime, safeOffset);
        }

        if (slotIndex === longestSlot) {
          src.onended = () => {
            if (this.isPlaying) {
              const elapsed = ctx.currentTime - this.playbackStartTime;
              if (elapsed >= this.duration - 0.05) {
                if (this.loop) {
                  this.play(0);
                } else {
                  this.pause();
                  this.pausedAtOffset = 0;
                  this.onTrackEnded?.();
                }
              }
            }
          };
        }

        this.sources.push(src);
        this.trackGains[slotIndex] = gainNode;
        this.trackAnalysers[slotIndex] = analyser;
      } catch (trackStartErr) {
        logger.error(
          'SCHEDULER',
          `Failed to schedule track slot ${slotIndex + 1} ("${track.name}")`,
          { err: String(trackStartErr) }
        );
      }
    });

    this.isPlaying = true;
    this.notifyState();
    logger.info('SCHEDULER', `Playback active at offset ${safeOffset.toFixed(2)}s`);
  }

  public pause() {
    if (!this.isPlaying) return;
    const nowOffset = this.getCurrentTime();
    this.pausedAtOffset = Math.min(nowOffset, this.duration);
    this.cleanupSources();
    this.isPlaying = false;
    this.notifyState();
  }

  public togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seek(timeSeconds: number) {
    const clamped = Math.max(0, Math.min(timeSeconds, this.duration));
    const wasPlaying = this.isPlaying;
    this.pausedAtOffset = clamped;
    if (wasPlaying) {
      this.play(clamped);
    } else {
      this.notifyState();
    }
  }

  public seekFrame(frameIndex: number) {
    const time = frameIndex / this.fps;
    this.seek(time);
  }

  public stop() {
    this.cleanupSources();
    this.isPlaying = false;
    this.pausedAtOffset = 0;
    this.notifyState();
  }

  public setLoop(loop: boolean) {
    this.loop = loop;
  }

  public getLoop(): boolean {
    return this.loop;
  }

  public setMasterVolume(vol: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime, 0.01);
    }
  }

  public setTrackVolume(trackIndex: number, vol: number, muted = false) {
    if (trackIndex >= 0 && trackIndex < 4) {
      this.trackVolumes[trackIndex] = vol;
      this.trackMutes[trackIndex] = muted;
    }
    if (this.trackGains[trackIndex] && this.ctx) {
      const target = muted ? 0 : Math.max(0, Math.min(1, vol));
      this.trackGains[trackIndex].gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
    }
  }

  /**
   * Deterministic Frame-Index Calculation (Pure Function of Hardware Clock)
   * All 4 sources start at playbackStartTime.
   * Every frame maps strictly to audioTime * 60 FPS.
   */
  public getCurrentFrame(): number {
    if (this.totalFrames === 0) return -1;
    if (!this.isPlaying) {
      const pausedFrame = Math.floor(this.pausedAtOffset * this.fps);
      return Math.max(0, Math.min(pausedFrame, this.totalFrames - 1));
    }
    if (!this.ctx) return -1;

    const elapsed = this.ctx.currentTime - this.playbackStartTime;
    if (elapsed < 0) return -1; // lookahead safety margin (200ms)

    const frameIndex = Math.floor(elapsed * this.fps);
    return Math.max(0, Math.min(frameIndex, this.totalFrames - 1));
  }

  public getCurrentTime(): number {
    if (!this.isPlaying) return this.pausedAtOffset;
    if (!this.ctx) return 0;
    const elapsed = this.ctx.currentTime - this.playbackStartTime;
    return Math.max(0, Math.min(elapsed, this.duration));
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getDuration(): number {
    return this.duration;
  }

  public getTotalFrames(): number {
    return this.totalFrames;
  }

  public getTrackAnalysers(): (AnalyserNode | undefined)[] {
    return this.trackAnalysers;
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public ensureAudioContext(): AudioContext {
    return this.initAudioContext();
  }

  public getMasterGain(): GainNode | null {
    if (!this.ctx) {
      this.initAudioContext();
    }
    return this.masterGain;
  }

  private cleanupSources() {
    this.sources.forEach((src) => {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
    });
    this.sources = [];

    // Disconnect old per-track gains and analysers so they do not leak or stack on masterGain
    this.trackGains.forEach((gain) => {
      try {
        gain?.disconnect();
      } catch {
        // already disconnected
      }
    });
    this.trackAnalysers.forEach((analyser) => {
      try {
        analyser?.disconnect();
      } catch {
        // already disconnected
      }
    });
    this.trackGains = new Array(4).fill(undefined);
    this.trackAnalysers = new Array(4).fill(undefined);
  }

  private notifyState() {
    this.onStateChange?.({
      isPlaying: this.isPlaying,
      isPaused: !this.isPlaying && this.pausedAtOffset > 0,
      currentTime: this.getCurrentTime(),
      currentFrame: this.getCurrentFrame(),
      duration: this.duration,
      totalFrames: this.totalFrames,
    });
  }

  public dispose() {
    this.stop();
  }
}
