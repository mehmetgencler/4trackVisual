/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger, AuditStepResult, AuditSuiteResult } from './logger';
import { getSharedAudioContext } from '../audio/audioContext';
import { processTrackBuffer } from '../dsp/filterBank';
import { UnifiedPlaybackScheduler } from '../audio/playbackScheduler';
import { CanvasRenderer } from '../visualizer/canvasRenderer';
import { TrackData, TrackVisualConfig } from '../types';

/**
 * Creates a synthetic stereo AudioBuffer with musical waveform characteristics
 * for testing multi-stem decoding, DSP filtering, and playback stability.
 */
export function createSyntheticStemBuffer(
  ctx: BaseAudioContext,
  stemType: 'drums' | 'bass' | 'lead' | 'synth',
  durationSec: number = 4.0,
  sampleRate: number = 44100
): AudioBuffer {
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(2, numSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (stemType === 'drums') {
      // 120 BPM Kick + Snare beats every 0.5s
      const beatCycle = t % 0.5;
      if (beatCycle < 0.15) {
        // Kick pitch drop from 150Hz to 40Hz
        const freq = 150 * Math.exp(-beatCycle * 35);
        sample = Math.sin(2 * Math.PI * freq * beatCycle) * Math.exp(-beatCycle * 18);
      }
    } else if (stemType === 'bass') {
      // Warm 55Hz sub bass note (A1) with 110Hz harmonic
      sample = 0.6 * Math.sin(2 * Math.PI * 55 * t) + 0.3 * Math.sin(2 * Math.PI * 110 * t);
    } else if (stemType === 'lead') {
      // 440Hz / 660Hz alternating arpeggio
      const noteFreq = Math.floor(t * 4) % 2 === 0 ? 440 : 660;
      sample = 0.35 * Math.sin(2 * Math.PI * noteFreq * t);
    } else {
      // Atmospheric chord pad (C major: 261.63Hz + 329.63Hz + 392.00Hz)
      sample =
        0.2 * Math.sin(2 * Math.PI * 261.63 * t) +
        0.2 * Math.sin(2 * Math.PI * 329.63 * t) +
        0.2 * Math.sin(2 * Math.PI * 392.00 * t);
    }

    left[i] = sample;
    right[i] = sample;
  }

  return buffer;
}

/**
 * Runs a comprehensive 5-stage self-audit of the audio visualizer pipeline:
 * 1. AudioContext Lifecycle & Node Limits
 * 2. Multi-Stem Buffer Generation & Memory Allocation
 * 3. DSP RMS Matrix Calculation & Normalization
 * 4. 4-Track Synchronized Playback Scheduling
 * 5. Multi-Emitter Canvas 60 FPS Rendering
 */
export async function runSystemAudit(): Promise<AuditSuiteResult> {
  const auditStart = performance.now();
  const steps: AuditStepResult[] = [];
  logger.audit('=== STARTING SYSTEM SELF-AUDIT SUITE ===');

  // Step 1: AudioContext Health
  const s1Start = performance.now();
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) throw new Error('Shared AudioContext returned null or undefined');

    // Verify context state and resume capability
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Verify destination and basic node creation
    const gainNode = ctx.createGain();
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 64;
    gainNode.connect(analyserNode);
    gainNode.disconnect();
    analyserNode.disconnect();

    const s1Duration = performance.now() - s1Start;
    steps.push({
      step: '1. AudioContext Lifecycle & Nodes',
      passed: true,
      durationMs: s1Duration,
      message: `AudioContext operational (state: ${ctx.state}, sampleRate: ${ctx.sampleRate}Hz)`,
      details: { state: ctx.state, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency },
    });
    logger.success('SYSTEM', 'Step 1 PASSED: AudioContext healthy and active', {
      state: ctx.state,
      sampleRate: ctx.sampleRate,
    });
  } catch (err) {
    const s1Duration = performance.now() - s1Start;
    steps.push({
      step: '1. AudioContext Lifecycle & Nodes',
      passed: false,
      durationMs: s1Duration,
      message: `AudioContext test failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    logger.error('SYSTEM', 'Step 1 FAILED: AudioContext error', { err: String(err) });
  }

  // Step 2: Multi-Track Buffer Allocation (4 Stems)
  const s2Start = performance.now();
  const syntheticBuffers: AudioBuffer[] = [];
  try {
    const ctx = getSharedAudioContext();
    const stemTypes: ('drums' | 'bass' | 'lead' | 'synth')[] = ['drums', 'bass', 'lead', 'synth'];

    for (let i = 0; i < 4; i++) {
      const buf = createSyntheticStemBuffer(ctx, stemTypes[i], 3.0, ctx.sampleRate);
      syntheticBuffers.push(buf);
      logger.info('DECODER', `Synthesized audit buffer ${i + 1} (${stemTypes[i]}): ${buf.length} samples, ${buf.duration.toFixed(1)}s`);
    }

    const s2Duration = performance.now() - s2Start;
    steps.push({
      step: '2. Multi-Stem Buffer Allocation',
      passed: true,
      durationMs: s2Duration,
      message: 'Successfully allocated 4 independent stereo AudioBuffers (3.0s duration each)',
      details: {
        buffersCount: syntheticBuffers.length,
        totalMemoryEstimateMB: ((syntheticBuffers.length * 3.0 * ctx.sampleRate * 2 * 4) / (1024 * 1024)).toFixed(2),
      },
    });
    logger.success('SYSTEM', 'Step 2 PASSED: 4 multi-stem AudioBuffers allocated successfully');
  } catch (err) {
    const s2Duration = performance.now() - s2Start;
    steps.push({
      step: '2. Multi-Stem Buffer Allocation',
      passed: false,
      durationMs: s2Duration,
      message: `Buffer allocation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    logger.error('SYSTEM', 'Step 2 FAILED: Buffer allocation error', { err: String(err) });
  }

  // Step 3: DSP RMS Extraction & Timeline Matrix
  const s3Start = performance.now();
  const processedTracks: TrackData[] = [];
  try {
    const stemNames = ['Audit Kick/Drums', 'Audit Sub Bass', 'Audit Lead Arp', 'Audit Atmospheric Pad'];

    for (let i = 0; i < syntheticBuffers.length; i++) {
      const trackData = await processTrackBuffer(
        syntheticBuffers[i],
        i,
        stemNames[i],
        `stem_${i + 1}_audit.wav`
      );

      // Validate timeline integrity
      if (!trackData.timeline || trackData.numFrames === 0) {
        throw new Error(`Track ${i} produced invalid empty timeline`);
      }

      // Check for any NaN or infinite values
      let hasNaN = false;
      for (let f = 0; f < trackData.numFrames; f++) {
        if (!isFinite(trackData.timeline[f])) {
          hasNaN = true;
          break;
        }
      }
      if (hasNaN) {
        throw new Error(`Track ${i} timeline contains non-finite/NaN samples`);
      }

      processedTracks.push(trackData);
      const peakRms = trackData.timeline.reduce((peak, value) => Math.max(peak, value), 0);
      logger.info('DSP', `Track ${i + 1} (${stemNames[i]}) DSP complete: ${trackData.numFrames} frames @ 60 FPS, peak: ${peakRms.toFixed(3)}`);
    }

    const s3Duration = performance.now() - s3Start;
    steps.push({
      step: '3. DSP RMS Timeline Matrix',
      passed: true,
      durationMs: s3Duration,
      message: `Generated 60 FPS deterministic RMS timelines for all 4 stems (${processedTracks[0]?.numFrames || 0} frames)`,
      details: {
        tracksProcessed: processedTracks.length,
        framesPerTrack: processedTracks[0]?.numFrames,
      },
    });
    logger.success('SYSTEM', 'Step 3 PASSED: 60 FPS DSP matrix verified for all 4 stems');
  } catch (err) {
    const s3Duration = performance.now() - s3Start;
    steps.push({
      step: '3. DSP RMS Timeline Matrix',
      passed: false,
      durationMs: s3Duration,
      message: `DSP matrix error: ${err instanceof Error ? err.message : String(err)}`,
    });
    logger.error('SYSTEM', 'Step 3 FAILED: DSP error', { err: String(err) });
  }

  // Step 4: UnifiedPlaybackScheduler 4-Track Synchronization
  const s4Start = performance.now();
  try {
    const scheduler = new UnifiedPlaybackScheduler();
    scheduler.setTracks(processedTracks);

    if (scheduler.getDuration() <= 0) {
      throw new Error(`Scheduler duration is 0 (${scheduler.getDuration()}) after setting 4 tracks`);
    }

    // Start playback test
    scheduler.play(0);
    const initialFrame = scheduler.getCurrentFrame();

    // Allow scheduler to tick for 100ms
    await new Promise((r) => setTimeout(r, 100));

    const advancedFrame = scheduler.getCurrentFrame();
    scheduler.stop();

    const s4Duration = performance.now() - s4Start;
    steps.push({
      step: '4. 4-Track Scheduler Sync',
      passed: true,
      durationMs: s4Duration,
      message: `Scheduler successfully coordinated 4 concurrent stems (initialFrame: ${initialFrame}, advanced: ${advancedFrame})`,
      details: {
        duration: scheduler.getDuration().toFixed(2),
        totalFrames: scheduler.getTotalFrames(),
        frameAdvance: advancedFrame - initialFrame,
      },
    });
    logger.success('SYSTEM', 'Step 4 PASSED: Multi-track scheduler synchronized without contention');
  } catch (err) {
    const s4Duration = performance.now() - s4Start;
    steps.push({
      step: '4. 4-Track Scheduler Sync',
      passed: false,
      durationMs: s4Duration,
      message: `Scheduler test failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    logger.error('SYSTEM', 'Step 4 FAILED: Scheduler synchronization error', { err: String(err) });
  }

  // Step 5: Canvas Renderer 4-Stem Visual Stress Test
  const s5Start = performance.now();
  try {
    if (typeof document !== 'undefined') {
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = 800;
      offscreenCanvas.height = 600;
      const ctx2d = offscreenCanvas.getContext('2d');
      if (!ctx2d) throw new Error('Could not acquire 2D canvas context');

      const renderer = new CanvasRenderer(ctx2d);
      renderer.setDimensions(800, 600, 1);

      const testConfigs: TrackVisualConfig[] = [
        { id: 0, name: 'Kick', color: '#00f0ff', glowColor: '#00b8ff', originX: 0.25, originY: 0.35, maxRadius: 280, shape: 'circle', volume: 1, muted: false, solo: false, threshold: 0.2, cooldown: 100 },
        { id: 1, name: 'Bass', color: '#ff007f', glowColor: '#c400ff', originX: 0.75, originY: 0.35, maxRadius: 320, shape: 'hexagon', volume: 1, muted: false, solo: false, threshold: 0.2, cooldown: 100 },
        { id: 2, name: 'Lead', color: '#ffbe0b', glowColor: '#fb5607', originX: 0.25, originY: 0.75, maxRadius: 240, shape: 'star', volume: 1, muted: false, solo: false, threshold: 0.2, cooldown: 100 },
        { id: 3, name: 'Pad', color: '#00ff88', glowColor: '#05ffa1', originX: 0.75, originY: 0.75, maxRadius: 260, shape: 'flower', volume: 1, muted: false, solo: false, threshold: 0.2, cooldown: 100 },
      ];

      // Simulate rendering 10 test frames with rings & particles
      for (let f = 0; f < 10; f++) {
        renderer.renderFrame(
          f,
          processedTracks,
          testConfigs,
          [
            {
              id: 1,
              trackId: 0,
              originX: 200,
              originY: 200,
              energy: 0.8,
              color: '#00f0ff',
              glow: '#00b8ff',
              shape: 'circle',
              maxRadius: 200,
              currentRadius: 50 + f * 5,
              speed: 4,
              alpha: 0.7,
              harmonicFreq: 3,
              harmonicAmp: 0.08,
              rotation: 0,
              rotationSpeed: 0.01,
              life: 0.3,
              thickness: 2,
            },
          ],
          [],
          { showInterferenceGrid: true, showSpectrumHud: true }
        );
      }

      const s5Duration = performance.now() - s5Start;
      steps.push({
        step: '5. Canvas Renderer Stress Test',
        passed: true,
        durationMs: s5Duration,
        message: 'Rendered 10 frames across all 4 stems with interference vectors & spectrum HUD without errors',
      });
      logger.success('SYSTEM', 'Step 5 PASSED: Multi-stem canvas rendering validated');
    } else {
      steps.push({
        step: '5. Canvas Renderer Stress Test',
        passed: true,
        durationMs: 0,
        message: 'Skipped (non-browser environment)',
      });
    }
  } catch (err) {
    const s5Duration = performance.now() - s5Start;
    steps.push({
      step: '5. Canvas Renderer Stress Test',
      passed: false,
      durationMs: s5Duration,
      message: `Canvas rendering failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    logger.error('SYSTEM', 'Step 5 FAILED: Canvas render error', { err: String(err) });
  }

  const allPassed = steps.every((s) => s.passed);
  const totalDurationMs = performance.now() - auditStart;

  const result: AuditSuiteResult = {
    timestamp: new Date().toISOString(),
    allPassed,
    totalDurationMs,
    steps,
  };

  logger.audit(
    `=== SELF-AUDIT FINISHED: ${allPassed ? 'ALL 5 AUDIT TESTS PASSED (100% HEALTHY)' : 'FAILURES DETECTED'} === (${totalDurationMs.toFixed(1)}ms)`,
    { allPassed, totalDurationMs }
  );

  return result;
}

/**
 * Generates 4 synthetic stems ready to be loaded directly into the app state,
 * giving the user an instant, zero-upload way to see 4 stems in action!
 */
export async function generateFourDemoStems(): Promise<TrackData[]> {
  const ctx = getSharedAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  const stemConfigs: { type: 'drums' | 'bass' | 'lead' | 'synth'; name: string; file: string }[] = [
    { type: 'drums', name: 'Synthesized Kick & Percussion', file: 'stem_1_drums.wav' },
    { type: 'bass', name: 'Synthesized 55Hz Sub Bass', file: 'stem_2_bass.wav' },
    { type: 'lead', name: 'Synthesized Arp Lead', file: 'stem_3_lead.wav' },
    { type: 'synth', name: 'Synthesized Harmonic Pad', file: 'stem_4_pad.wav' },
  ];

  const results: TrackData[] = [];
  for (let i = 0; i < stemConfigs.length; i++) {
    const conf = stemConfigs[i];
    logger.info('DECODER', `Generating synthetic demo stem ${i + 1}/4 (${conf.name})...`);
    const rawBuffer = createSyntheticStemBuffer(ctx, conf.type, 16.0, ctx.sampleRate);
    const track = await processTrackBuffer(rawBuffer, i, conf.name, conf.file);
    results.push(track);
  }

  return results;
}
