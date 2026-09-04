/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global Web Audio API Context Singleton.
 *
 * Browsers enforce a strict hardware limit on AudioContext instances (usually max 6).
 * Creating multiple AudioContexts for file decoding or stem playback exhausts this quota,
 * resulting in "The number of hardware contexts provided (6) is greater than the maximum allowed (6)"
 * and crashing the DSP pipeline.
 *
 * Reusing a single AudioContext across decoding, scheduling, and analysis guarantees stability.
 */

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('Web Audio API is only available in browser environments.');
  }

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    sharedAudioContext = new AudioContextClass();
  }

  return sharedAudioContext;
}

export async function resumeSharedAudioContext(): Promise<AudioContext> {
  const ctx = getSharedAudioContext();
  if (ctx.state === 'suspended') {
    try {
      // Race against 80ms timeout so execution never hangs indefinitely on browsers enforcing autoplay restrictions
      await Promise.race([
        ctx.resume(),
        new Promise((resolve) => setTimeout(resolve, 80)),
      ]);
    } catch (e) {
      console.warn('AudioContext auto-resume pending user interaction:', e);
    }
  }
  return ctx;
}
