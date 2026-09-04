/**
 * Resampling helper to ensure decoded PCM is compatible with the shared AudioContext.
 *
 * Strategy:
 * 1. Try to create an AudioBuffer on the shared AudioContext at the file's native sample rate.
 * 2. If createBuffer throws (Safari or platform-specific restrictions), fall back to an OfflineAudioContext
 *    render pass to resample into the shared AudioContext's sample rate.
 * 3. If OfflineAudioContext is not available, perform a simple linear/nearest resample into the shared
 *    context sample rate (synchronous, minimal and safe).
 */

import { getSharedAudioContext } from './audioContext';

export async function ensureBufferInContext(
  srcSampleRate: number,
  channelDataArrays: Float32Array[],
  srcFrameCount: number
): Promise<AudioBuffer> {
  const ctx = getSharedAudioContext();
  const targetSampleRate = ctx.sampleRate;
  const numChannels = channelDataArrays.length;

  // Fast-path: try to create buffer directly at the source sample rate on the shared context
  try {
    const b = ctx.createBuffer(numChannels, srcFrameCount, srcSampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      b.getChannelData(ch).set(channelDataArrays[ch].subarray(0, srcFrameCount));
    }
    return b;
  } catch (createErr) {
    // fall through to resampling fallback
    console.warn('ensureBufferInContext: createBuffer failed for source sampleRate', srcSampleRate, 'falling back to resample:', createErr);
  }

  // If sample rates are already equal, but createBuffer failed, try creating at target rate and copy (may truncate/expand)
  if (srcSampleRate === targetSampleRate) {
    const out = ctx.createBuffer(numChannels, srcFrameCount, targetSampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      out.getChannelData(ch).set(channelDataArrays[ch].subarray(0, srcFrameCount));
    }
    return out;
  }

  // Try OfflineAudioContext-based resampling (recommended)
  const OfflineClass = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (typeof OfflineClass === 'function') {
    // Calculate required frames for target sample rate
    const estimatedFrames = Math.ceil(srcFrameCount * (targetSampleRate / srcSampleRate));
    const offline = new OfflineClass(numChannels, estimatedFrames, targetSampleRate);

    // Create a temporary buffer in the offline context at the source sample rate and copy channel data
    const tmp = offline.createBuffer(numChannels, srcFrameCount, srcSampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      tmp.getChannelData(ch).set(channelDataArrays[ch].subarray(0, srcFrameCount));
    }

    const srcNode = offline.createBufferSource();
    srcNode.buffer = tmp;
    srcNode.connect(offline.destination);
    srcNode.start(0);

    try {
      const rendered: AudioBuffer = await offline.startRendering();
      // Now create a final buffer on the shared audio context and copy rendered data
      const out = ctx.createBuffer(rendered.numberOfChannels, rendered.length, rendered.sampleRate);
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        out.getChannelData(ch).set(rendered.getChannelData(ch));
      }
      return out;
    } catch (renderErr) {
      console.warn('ensureBufferInContext: OfflineAudioContext rendering failed, falling back to synchronous resample:', renderErr);
      // Fall through to synchronous resample below
    }
  }

  // Last-resort synchronous resample (linear / nearest). This is slower but safe.
  const dstFrameCount = Math.ceil(srcFrameCount * (targetSampleRate / srcSampleRate));
  const out = ctx.createBuffer(numChannels, dstFrameCount, targetSampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const src = channelDataArrays[ch];
    const dst = out.getChannelData(ch);
    // Linear interpolation resample
    const ratio = srcSampleRate / targetSampleRate;
    for (let i = 0; i < dstFrameCount; i++) {
      const srcPos = i * ratio;
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(i0 + 1, srcFrameCount - 1);
      const t = srcPos - i0;
      const s0 = src[i0] || 0;
      const s1 = src[i1] || 0;
      dst[i] = s0 + (s1 - s0) * t;
    }
  }

  return out;
}
