/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActiveRing, SparkParticle, TrackData, TrackVisualConfig, RingShape } from '../types';

/**
 * Robustly converts any hex color to rgba(...) format.
 * Prevents DOMException in canvas addColorStop on engines that do not support 8-digit hex.
 */
function hexToRgba(color: string, alpha: number): string {
  if (!color) return `rgba(255, 255, 255, ${alpha})`;
  const clampedAlpha = Math.max(0, Math.min(1, isFinite(alpha) ? alpha : 0));
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha.toFixed(3)})`;
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha.toFixed(3)})`;
    }
  }
  return color;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 800;
  private height = 600;
  private dpr = 1;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public setDimensions(width: number, height: number, dpr = 1) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  public renderFrame(
    frameIndex: number,
    tracks: TrackData[],
    configs: TrackVisualConfig[],
    rings: ActiveRing[],
    particles: SparkParticle[],
    options?: {
      draggingTrackId?: number | null;
      hoveredTrackId?: number | null;
      showInterferenceGrid?: boolean;
      showSpectrumHud?: boolean;
    }
  ) {
    try {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      ctx.save();
      ctx.scale(this.dpr, this.dpr);

      // 1. Draw Background & Atmospheric Grid
      this.drawBackground(ctx, w, h, frameIndex, tracks, configs, options?.showInterferenceGrid ?? true);

      // 2. Draw Quad-Stem Interconnection Web (Interference vectors)
      this.drawInterferenceNetwork(ctx, w, h, configs, tracks, frameIndex);

      // 3. Draw Emitter Cores at Origins
      this.drawEmitterCores(ctx, w, h, configs, tracks, frameIndex, options);

      // 4. Draw Rings & Particles with Additive Blending (O(1) iteration without array allocation/sorting)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < rings.length; i++) {
        this.drawRing(ctx, rings[i]);
      }

      for (let i = 0; i < particles.length; i++) {
        this.drawParticle(ctx, particles[i]);
      }
      ctx.restore();

      // 5. Draw HUD overlays / Mini band spectrum meters if enabled
      if (options?.showSpectrumHud) {
        this.drawSpectrumHud(ctx, w, h, tracks, configs, frameIndex);
      }

      ctx.restore();
    } catch (renderErr) {
      console.warn('[CanvasRenderer] Caught non-fatal render frame error:', renderErr);
    }
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    frameIndex: number,
    tracks: TrackData[],
    configs: TrackVisualConfig[],
    showGrid: boolean
  ) {
    // Deep obsidian space gradient
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, '#0a0d16');
    bgGrad.addColorStop(0.65, '#05070b');
    bgGrad.addColorStop(1, '#020305');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    if (showGrid) {
      // Subtle cyber-space grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      const startX = 0;
      const startY = 0;

      ctx.beginPath();
      for (let x = startX; x <= w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = startY; y <= h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }
  }

  private drawInterferenceNetwork(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    configs: TrackVisualConfig[],
    tracks: TrackData[],
    frameIndex: number
  ) {
    if (configs.length < 2) return;

    ctx.save();
    ctx.lineWidth = 1;

    for (let i = 0; i < configs.length; i++) {
      for (let j = i + 1; j < configs.length; j++) {
        const c1 = configs[i];
        const c2 = configs[j];

        const x1 = c1.originX * w;
        const y1 = c1.originY * h;
        const x2 = c2.originX * w;
        const y2 = c2.originY * h;

        // Calculate average activity between the two stems
        let energy1 = 0;
        let energy2 = 0;
        if (frameIndex >= 0 && tracks[i]?.timeline && tracks[j]?.timeline) {
          energy1 = tracks[i].timeline[frameIndex] || 0;
          energy2 = tracks[j].timeline[frameIndex] || 0;
        }
        const combinedEnergy = (energy1 + energy2) * 0.5;

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        const edgeAlpha = Math.max(0.06, Math.min(0.4, 0.08 + combinedEnergy * 0.28));
        grad.addColorStop(0, hexToRgba(c1.color, edgeAlpha));
        grad.addColorStop(1, hexToRgba(c2.color, edgeAlpha));

        ctx.strokeStyle = grad;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawEmitterCores(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    configs: TrackVisualConfig[],
    tracks: TrackData[],
    frameIndex: number,
    options?: { draggingTrackId?: number | null; hoveredTrackId?: number | null }
  ) {
    configs.forEach((config, idx) => {
      const ox = config.originX * w;
      const oy = config.originY * h;

      let energy = 0;
      if (frameIndex >= 0 && tracks[idx]?.timeline) {
        energy = tracks[idx].timeline[frameIndex] || 0;
      }

      const isDragging = options?.draggingTrackId === config.id;
      const isHovered = options?.hoveredTrackId === config.id;

      ctx.save();

      // Outer halo
      const haloRadius = Math.max(8, 14 + energy * 26 + (isDragging ? 6 : 0));
      const haloGrad = ctx.createRadialGradient(ox, oy, 2, ox, oy, haloRadius);
      haloGrad.addColorStop(0, hexToRgba(config.color, 0.45));
      haloGrad.addColorStop(0.5, hexToRgba(config.glowColor, 0.15));
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(ox, oy, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // Core anchor dot
      ctx.fillStyle = config.color;
      ctx.beginPath();
      ctx.arc(ox, oy, isDragging ? 7 : isHovered ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();

      // White hot center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Track Label tag
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(`${config.name.toUpperCase()}`, ox, oy + 22);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText(`${Math.round(config.originX * 100)}%, ${Math.round(config.originY * 100)}%`, ox, oy + 33);

      ctx.restore();
    });
  }

  private drawRing(ctx: CanvasRenderingContext2D, ring: ActiveRing) {
    const { originX, originY, currentRadius, shape, alpha, color, glow, thickness, harmonicFreq, harmonicAmp, rotation } = ring;

    if (currentRadius <= 0 || alpha <= 0.005) return;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.rotate(rotation);

    // Apply quadratic alpha to stroke color
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    if (ring.energy > 0.45) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = Math.min(12, 3 + ring.energy * 8);
    }

    ctx.beginPath();

    switch (shape) {
      case 'hexagon':
        this.drawPolygonPath(ctx, 6, currentRadius, harmonicFreq, harmonicAmp);
        break;
      case 'star':
        this.drawStarPath(ctx, 5, currentRadius, currentRadius * 0.45, harmonicAmp);
        break;
      case 'diamond':
        this.drawPolygonPath(ctx, 4, currentRadius, harmonicFreq, harmonicAmp);
        break;
      case 'flower':
        this.drawFlowerPath(ctx, 6, currentRadius, harmonicAmp);
        break;
      case 'circle':
      default:
        this.drawHarmonicCirclePath(ctx, currentRadius, harmonicFreq, harmonicAmp);
        break;
    }

    ctx.stroke();
    ctx.restore();
  }

  private drawHarmonicCirclePath(
    ctx: CanvasRenderingContext2D,
    radius: number,
    freq: number,
    amp: number
  ) {
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const deformation = 1 + Math.sin(angle * freq) * amp;
      const r = radius * deformation;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  private drawPolygonPath(
    ctx: CanvasRenderingContext2D,
    sides: number,
    radius: number,
    freq: number,
    amp: number
  ) {
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const deformation = 1 + Math.sin(angle * freq) * amp;
      const r = radius * deformation;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  private drawStarPath(
    ctx: CanvasRenderingContext2D,
    points: number,
    outerR: number,
    innerR: number,
    amp: number
  ) {
    const totalPoints = points * 2;
    for (let i = 0; i < totalPoints; i++) {
      const angle = (i / totalPoints) * Math.PI * 2;
      const baseR = i % 2 === 0 ? outerR * (1 + amp) : innerR;
      const x = Math.cos(angle) * baseR;
      const y = Math.sin(angle) * baseR;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  private drawFlowerPath(
    ctx: CanvasRenderingContext2D,
    petals: number,
    radius: number,
    amp: number
  ) {
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const petalDist = 1 + Math.cos(angle * petals) * (0.15 + amp * 0.5);
      const r = radius * petalDist;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: SparkParticle) {
    if (p.alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSpectrumHud(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    tracks: TrackData[],
    configs: TrackVisualConfig[],
    frameIndex: number
  ) {
    if (frameIndex < 0) return;

    ctx.save();
    const hudHeight = 36;
    const hudY = h - hudHeight - 12;
    const trackWidth = (w - 40) / 4;

    configs.forEach((config, idx) => {
      const track = tracks[idx];
      if (!track || !track.timeline) return;

      const tx = 20 + idx * trackWidth;
      const cardW = trackWidth - 8;
      const energy = track.timeline[frameIndex] || 0;
      const isTriggering = energy >= (config.threshold ?? 0.35);

      // Small background card
      ctx.fillStyle = isTriggering ? 'rgba(20, 24, 38, 0.85)' : 'rgba(10, 14, 24, 0.75)';
      ctx.fillRect(tx, hudY, cardW, hudHeight);

      // Border highlight on trigger
      ctx.strokeStyle = isTriggering ? hexToRgba(config.color, 0.55) : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, hudY, cardW, hudHeight);

      // Track mini title + RMS percentage
      ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = config.color;
      ctx.textAlign = 'left';
      ctx.fillText(config.name.toUpperCase(), tx + 6, hudY + 12);

      ctx.textAlign = 'right';
      ctx.fillStyle = isTriggering ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(`RMS ${Math.round(energy * 100)}%`, tx + cardW - 6, hudY + 12);

      // RMS meter track bar
      const barX = tx + 6;
      const barY = hudY + 18;
      const barW = cardW - 12;
      const barH = 10;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(barX, barY, barW, barH);

      // Filled RMS bar
      const fillW = Math.max(0, Math.min(barW, barW * energy));
      ctx.fillStyle = isTriggering ? config.color : hexToRgba(config.color, 0.7);
      ctx.fillRect(barX, barY, fillW, barH);

      // Threshold marker line
      const threshX = barX + barW * Math.min(1, Math.max(0, config.threshold ?? 0.35));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(threshX - 1, barY - 1, 2, barH + 2);
    });

    ctx.restore();
  }
}
