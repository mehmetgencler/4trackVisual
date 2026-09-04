*** Begin Patch
*** Update File: src/audio/audioDecoder.ts
@@
-import { getSharedAudioContext, resumeSharedAudioContext } from './audioContext';
-import { logger } from '../diagnostics/logger';
+import { getSharedAudioContext, resumeSharedAudioContext } from './audioContext';
+import { logger } from '../diagnostics/logger';
+import { ensureBufferInContext } from './resample';
@@
-  const isWav = isWavOrRf64Format(arrayBuffer) || file.name.toLowerCase().endsWith('.wav');
-  if (isWav) {
-    try {
-      const parsedWav = parseWavFile(arrayBuffer);
-      if (parsedWav && parsedWav.length > 0) {
-        const duration = performance.now() - decodeStart;
-        logger.success(
-          'DECODER',
-          `Pure-JS WAV fallback decoded "${file.name}" in ${duration.toFixed(1)}ms (${parsedWav.numberOfChannels}ch, ${parsedWav.sampleRate}Hz)`
-        );
-        return parsedWav;
-      }
-    } catch (wavErr) {
-      logger.warn('DECODER', `Pure-JS WAV fallback failed for "${file.name}": ${String(wavErr)}`, {
-        err: String(wavErr),
-      });
-    }
-  }
+  const isWav = isWavOrRf64Format(arrayBuffer) || file.name.toLowerCase().endsWith('.wav');
+  if (isWav) {
+    try {
+      const parsedWav = await parseWavFile(arrayBuffer);
+      if (parsedWav && parsedWav.length > 0) {
+        const duration = performance.now() - decodeStart;
+        logger.success(
+          'DECODER',
+          `Pure-JS WAV fallback decoded "${file.name}" in ${duration.toFixed(1)}ms (${parsedWav.numberOfChannels}ch, ${parsedWav.sampleRate}Hz)`
+        );
+        return parsedWav;
+      }
+    } catch (wavErr) {
+      logger.warn('DECODER', `Pure-JS WAV fallback failed for "${file.name}": ${String(wavErr)}`, {
+        err: String(wavErr),
+      });
+    }
+  }
@@
-  const isAiff = isAiffFormat(arrayBuffer) || file.name.toLowerCase().endsWith('.aif') || file.name.toLowerCase().endsWith('.aiff');
-  if (isAiff) {
-    try {
-      const parsedAiff = parseAiffFile(arrayBuffer);
-      if (parsedAiff && parsedAiff.length > 0) {
-        const duration = performance.now() - decodeStart;
-        logger.success(
-          'DECODER',
-          `Pure-JS AIFF fallback decoded "${file.name}" in ${duration.toFixed(1)}ms (${parsedAiff.numberOfChannels}ch, ${parsedAiff.sampleRate}Hz)`
-        );
-        return parsedAiff;
-      }
-    } catch (aiffErr) {
-      logger.warn('DECODER', `Pure-JS AIFF fallback failed for "${file.name}": ${String(aiffErr)}`);
-    }
-  }
+  const isAiff = isAiffFormat(arrayBuffer) || file.name.toLowerCase().endsWith('.aif') || file.name.toLowerCase().endsWith('.aiff');
+  if (isAiff) {
+    try {
+      const parsedAiff = await parseAiffFile(arrayBuffer);
+      if (parsedAiff && parsedAiff.length > 0) {
+        const duration = performance.now() - decodeStart;
+        logger.success(
+          'DECODER',
+          `Pure-JS AIFF fallback decoded "${file.name}" in ${duration.toFixed(1)}ms (${parsedAiff.numberOfChannels}ch, ${parsedAiff.sampleRate}Hz)`
+        );
+        return parsedAiff;
+      }
+    } catch (aiffErr) {
+      logger.warn('DECODER', `Pure-JS AIFF fallback failed for "${file.name}": ${String(aiffErr)}`);
+    }
+  }
*** End Patch
