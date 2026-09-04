/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExportProgress {
  status: 'idle' | 'recording' | 'processing' | 'completed' | 'error';
  recordedSeconds: number;
  totalSeconds: number;
  percentage: number;
  blobUrl?: string;
  errorMessage?: string;
}

export class VideoExporter {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording = false;
  private canvasStream: MediaStream | null = null;
  private combinedStream: MediaStream | null = null;
  private audioStreamDestination: MediaStreamAudioDestinationNode | null = null;
  private audioSourceNode: AudioNode | null = null;
  private activeMimeType = 'video/webm';

  public async startRecording(
    canvas: HTMLCanvasElement,
    audioCtx?: AudioContext | null,
    audioSourceNode?: AudioNode | null,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<void> {
    this.recordedChunks = [];
    this.isRecording = true;

    try {
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported in this browser environment.');
      }

      // 1. Capture 60 FPS stream from canvas (or fallback mozCaptureStream)
      const captureStreamFn =
        canvas.captureStream ||
        (canvas as unknown as { mozCaptureStream: (fps: number) => MediaStream }).mozCaptureStream;

      if (!captureStreamFn) {
        throw new Error('Canvas captureStream is not supported in this browser.');
      }

      this.canvasStream = captureStreamFn.call(canvas, 60);

      // 2. Capture audio from AudioNode if available and valid
      this.audioSourceNode = null;
      this.audioStreamDestination = null;

      if (audioCtx && audioSourceNode) {
        try {
          // AudioNode MUST have outputs to be connectable (e.g., GainNode, not DestinationNode)
          if (audioSourceNode.numberOfOutputs > 0) {
            this.audioStreamDestination = audioCtx.createMediaStreamDestination();
            audioSourceNode.connect(this.audioStreamDestination);
            this.audioSourceNode = audioSourceNode;
          }
        } catch (audioErr) {
          console.warn('Audio capture failed to connect, continuing with video only:', audioErr);
        }
      }

      // 3. Combine audio and video tracks
      const tracks: MediaStreamTrack[] = [...this.canvasStream.getVideoTracks()];
      if (this.audioStreamDestination) {
        tracks.push(...this.audioStreamDestination.stream.getAudioTracks());
      }
      this.combinedStream = new MediaStream(tracks);

      // 4. Determine supported MIME type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=avc1,mp4a',
        'video/mp4',
      ];
      let selectedMimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        for (const mime of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mime)) {
            selectedMimeType = mime;
            break;
          }
        }
      }
      this.activeMimeType = selectedMimeType || 'video/webm';

      // 5. Initialize MediaRecorder with fallback
      try {
        this.mediaRecorder = new MediaRecorder(
          this.combinedStream,
          selectedMimeType ? { mimeType: selectedMimeType, videoBitsPerSecond: 6000000 } : undefined
        );
      } catch {
        // Fallback without options
        this.mediaRecorder = new MediaRecorder(this.combinedStream);
      }

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(100); // chunk every 100ms
      onProgress?.({
        status: 'recording',
        recordedSeconds: 0,
        totalSeconds: 0,
        percentage: 0,
      });
    } catch (err) {
      this.isRecording = false;
      this.cleanup();
      onProgress?.({
        status: 'error',
        recordedSeconds: 0,
        totalSeconds: 0,
        percentage: 0,
        errorMessage: err instanceof Error ? err.message : 'Failed to initialize video capture',
      });
      throw err;
    }
  }

  public stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        if (this.recordedChunks.length > 0) {
          const blob = new Blob(this.recordedChunks, { type: this.activeMimeType });
          this.cleanup();
          resolve(blob);
          return;
        }
        this.cleanup();
        reject(new Error('No active recorder or recording was already stopped'));
        return;
      }

      const finishStop = () => {
        this.isRecording = false;
        const blob = new Blob(this.recordedChunks, { type: this.activeMimeType });
        this.cleanup();
        resolve(blob);
      };

      // Safety timeout in case onstop does not fire
      const safetyTimer = setTimeout(() => {
        finishStop();
      }, 2000);

      this.mediaRecorder.onstop = () => {
        clearTimeout(safetyTimer);
        finishStop();
      };

      try {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
        this.mediaRecorder.stop();
      } catch (stopErr) {
        clearTimeout(safetyTimer);
        finishStop();
      }
    });
  }

  public cancelRecording() {
    this.isRecording = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanup();
  }

  private cleanup() {
    if (this.audioSourceNode && this.audioStreamDestination) {
      try {
        this.audioSourceNode.disconnect(this.audioStreamDestination);
      } catch {
        // ignore
      }
      this.audioSourceNode = null;
      this.audioStreamDestination = null;
    }
    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach((t) => t.stop());
      this.canvasStream = null;
    }
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach((t) => t.stop());
      this.combinedStream = null;
    }
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}
