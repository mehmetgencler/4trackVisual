// Safe copy of source audio buffers into a target buffer with channel/index guards
export function copySourceIntoTarget(target: AudioBuffer, source: AudioBuffer, targetChannelOffset = 0): void {
  console.log('copySourceIntoTarget', { targetChannels: target.numberOfChannels, sourceChannels: source.numberOfChannels, targetChannelOffset });
  const copyLength = Math.min(target.length, source.length);
  for (let sCh = 0; sCh < source.numberOfChannels; sCh++) {
    const tCh = targetChannelOffset + sCh;
    if (tCh < 0 || tCh >= target.numberOfChannels) {
      throw new Error(`Invalid target channel index ${tCh} (source channel ${sCh}); target has ${target.numberOfChannels} channels`);
    }
    const targetData = target.getChannelData(tCh);
    const sourceData = source.getChannelData(sCh);
    if (!targetData || !sourceData) {
      throw new Error(`Missing channel data (tCh=${tCh}, sCh=${sCh})`);
    }
    // If lengths differ, copy the overlap and warn
    if (targetData.length !== sourceData.length) {
      console.warn(`Length mismatch target=${targetData.length} source=${sourceData.length}; copying min length=${copyLength}`);
    }
    targetData.set(sourceData.subarray(0, copyLength));
  }
}
