import { decodeTracksSequential } from './debug-decode';
import { copySourceIntoTarget } from './channel-copy-guard';

// Example: using the helpers to build a multi-track buffer
export async function handleFiles(files: FileList | File[], audioCtx: AudioContext): Promise<AudioBuffer | undefined> {
  const fileArray = Array.from(files);
  const decoded = await decodeTracksSequential(fileArray, audioCtx);
  // Create a multi-channel buffer that can hold all decoded channels
  const totalChannels = decoded.reduce((acc, buf) => acc + (buf?.numberOfChannels ?? 0), 0);
  if (totalChannels === 0) {
    console.warn('No decoded channels found');
    return;
  }
  const maxLength = Math.max(...decoded.map(b => b?.length ?? 0));
  const sampleRate = decoded.find(b => !!b)?.sampleRate ?? audioCtx.sampleRate;
  const target = audioCtx.createBuffer(totalChannels, maxLength, sampleRate);
  let offset = 0;
  for (const buf of decoded) {
    if (!buf) { console.warn('Skipping empty decoded buffer'); continue; }
    try {
      copySourceIntoTarget(target, buf, offset);
      offset += buf.numberOfChannels;
    } catch (err) {
      console.error('copy failed', err);
      // continue with remaining buffers
    }
  }
  // Now target contains mixed channels — you can attach to a buffer source to play
  return target;
}
