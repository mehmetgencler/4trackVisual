/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RingShape = 'circle' | 'hexagon' | 'star' | 'flower' | 'diamond';

export interface TrackData {
  id: number;
  name: string;
  fileName: string;
  monoBuffer: AudioBuffer;      // downmixed mono buffer for audio playback
  timeline: Float32Array;       // [numFrames at 60 FPS] normalized RMS energy (0..1)
  numFrames: number;
  duration: number;
  sampleRate: number;
}

export interface TrackVisualConfig {
  id: number;
  name: string;
  originX: number;   // normalized canvas X (0..1)
  originY: number;   // normalized canvas Y (0..1)
  color: string;     // primary ring color (HEX or HSL)
  glowColor: string; // additive glow aura color
  threshold: number; // sensitivity threshold (0..1) for RMS trigger
  cooldown: number;  // cooldown in ms between triggers
  maxRadius: number; // base max radius in pixels
  shape: RingShape;
  volume: number;    // 0..1
  muted: boolean;
  solo: boolean;
}

export interface ActiveRing {
  id: number;
  trackId: number;
  originX: number;
  originY: number;
  energy: number;    // stem RMS energy at trigger moment (0..1)
  color: string;
  glow: string;
  shape: RingShape;
  maxRadius: number;
  currentRadius: number;
  speed: number;
  alpha: number;
  harmonicFreq: number;
  harmonicAmp: number;
  rotation: number;
  rotationSpeed: number;
  life: number;      // 0 -> 1
  thickness: number;
}

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  trackId: number;
}

export interface ProcessingProgress {
  stage: 'idle' | 'decoding' | 'filtering' | 'normalizing' | 'ready';
  trackIndex: number;
  trackName: string;
  percent: number;
  detail: string;
}
