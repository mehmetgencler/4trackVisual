/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActiveRing, SparkParticle, TrackData, TrackVisualConfig, RingShape } from '../types';

export const MAX_GLOBAL_RINGS = 45;
export const MAX_GLOBAL_PARTICLES = 80;

export class TriggerEngine {
  // Cooldown tracking per track index [trackIndex] in ms
  private lastTriggerTimes: number[] = [0, 0, 0, 0];

  public activeRings: ActiveRing[] = [];
  public activeParticles: SparkParticle[] = [];
  private ringIdCounter = 0;

  public reset() {
    this.lastTriggerTimes = [0, 0, 0, 0];
    this.activeRings = [];
    this.activeParticles = [];
  }

  /**
   * Evaluates stem RMS energy for a track at frameIndex.
   * If threshold & cooldown criteria pass, spawns harmonic shockwave ring and spark particles.
   */
  public updateTrackTriggers(
    trackIndex: number,
    frameIndex: number,
    track: TrackData | undefined | null,
    config: TrackVisualConfig | undefined | null,
    currentTimeMs: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    if (!track || !track.timeline || !config) return;
    if (frameIndex < 0 || frameIndex >= track.numFrames) return;
    if (config.muted) return;

    // Direct RMS amplitude of the stem at this frame (0..1)
    const energy = track.timeline[frameIndex] || 0;
    const threshold = config.threshold ?? 0.35;
    const cooldown = config.cooldown ?? 100;

    if (energy >= threshold) {
      const lastTrigger = this.lastTriggerTimes[trackIndex] || 0;
      if (currentTimeMs - lastTrigger >= cooldown) {
        this.lastTriggerTimes[trackIndex] = currentTimeMs;

        // Compute absolute origin in pixels
        const ox = config.originX * canvasWidth;
        const oy = config.originY * canvasHeight;

        this.spawnRing({
          trackId: config.id,
          originX: ox,
          originY: oy,
          energy,
          color: config.color,
          glow: config.glowColor,
          shape: config.shape,
          baseMaxRadius: config.maxRadius,
        });

        // Emit particles on strong transients
        if (energy > 0.45) {
          this.spawnParticles(ox, oy, energy, config.color, trackIndex);
        }
      }
    }
  }

  private spawnRing(params: {
    trackId: number;
    originX: number;
    originY: number;
    energy: number;
    color: string;
    glow: string;
    shape: RingShape;
    baseMaxRadius: number;
  }) {
    // Check ring cap: drop lowest energy ring if full
    if (this.activeRings.length >= MAX_GLOBAL_RINGS) {
      let minIdx = 0;
      let minEnergy = 999;
      for (let i = 0; i < this.activeRings.length; i++) {
        if (this.activeRings[i].energy < minEnergy) {
          minEnergy = this.activeRings[i].energy;
          minIdx = i;
        }
      }
      // If the new ring has less energy than our weakest ring, drop the new trigger
      if (params.energy < minEnergy) {
        return;
      }
      this.activeRings.splice(minIdx, 1);
    }

    const harmonicFreq = 3 + (params.trackId % 4) * 2; // Unique harmonic lobes per stem (3, 5, 7, 9)
    const harmonicAmp = 0.04 + params.energy * 0.12;
    const dynamicMaxRadius = params.baseMaxRadius * (0.75 + 0.55 * params.energy);
    const expansionSpeed = 2.4 + params.energy * 2.2;

    this.activeRings.push({
      id: ++this.ringIdCounter,
      trackId: params.trackId,
      originX: params.originX,
      originY: params.originY,
      energy: params.energy,
      color: params.color,
      glow: params.glow,
      shape: params.shape,
      maxRadius: dynamicMaxRadius,
      currentRadius: 4,
      speed: expansionSpeed,
      alpha: 1.0,
      harmonicFreq,
      harmonicAmp,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.025,
      life: 0,
      thickness: Math.max(1.5, 1.5 + params.energy * 3.5),
    });
  }

  private spawnParticles(
    ox: number,
    oy: number,
    energy: number,
    color: string,
    trackId: number
  ) {
    const count = Math.min(8, Math.floor(2 + energy * 6));
    const speedBase = 1.5 + energy * 3.5;

    for (let i = 0; i < count; i++) {
      if (this.activeParticles.length >= MAX_GLOBAL_PARTICLES) {
        this.activeParticles.shift();
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = speedBase * (0.6 + Math.random() * 0.8);

      this.activeParticles.push({
        x: ox + (Math.random() - 0.5) * 10,
        y: oy + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 1.5 + Math.random() * (1 + energy * 2),
        alpha: 0.9,
        decay: 0.02 + Math.random() * 0.02,
        trackId,
      });
    }
  }

  /**
   * Advances ring expansion and particle physics.
   */
  public advanceLifecycle(deltaTimeSec: number = 1 / 60) {
    const speedMult = deltaTimeSec * 60;

    // Update rings
    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const ring = this.activeRings[i];
      ring.currentRadius += ring.speed * speedMult;
      ring.rotation += ring.rotationSpeed * speedMult;
      ring.life = Math.min(1, ring.currentRadius / ring.maxRadius);

      // Quadratic alpha fade: starts bright, gently falls off
      const fade = 1 - ring.life;
      ring.alpha = fade * fade;

      if (ring.life >= 1.0 || ring.alpha <= 0.01) {
        this.activeRings.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.x += p.vx * speedMult;
      p.y += p.vy * speedMult;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.alpha -= p.decay * speedMult;

      if (p.alpha <= 0.01) {
        this.activeParticles.splice(i, 1);
      }
    }
  }
}
