// Sequential decode helper with logging and error handling
export async function decodeTracksSequential(files: File[], audioCtx: AudioContext): Promise<AudioBuffer[]> {
  const decoded: AudioBuffer[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.groupCollapsed(`Decoding track ${i} — ${file?.name ?? '(missing)'}`);
    try {
      if (!file) throw new Error(`File missing at index ${i}`);
      console.log('file index', i, 'name', file.name, 'size', file.size, 'type', file.type);
      const arrayBuffer = await file.arrayBuffer();
      // Validate arrayBuffer length quickly
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Empty arrayBuffer');
      }
      // decodeAudioData returns a Promise in modern browsers
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer).catch(err => {
        console.error('decodeAudioData rejected for track', i, err);
        throw err;
      });
      console.log('decoded', { numberOfChannels: audioBuffer.numberOfChannels, length: audioBuffer.length, sampleRate: audioBuffer.sampleRate });
      decoded.push(audioBuffer);
    } catch (err) {
      console.error('Decoding failed for track', i, err);
      // Continue to collect logs and keep other tracks
    } finally {
      console.groupEnd();
    }
  }
  return decoded;
}
