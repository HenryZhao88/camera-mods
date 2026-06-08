export class Camera {
  readonly video: HTMLVideoElement;

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
  }

  async start(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      throw new Error(`Camera access failed: ${(err as Error).message}`);
    }
    this.video.srcObject = stream;
    await this.video.play();
    await new Promise<void>(resolve => {
      if (this.video.readyState >= 2) return resolve();
      this.video.onloadeddata = () => resolve();
    });
  }

  stop(): void {
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  get width(): number { return this.video.videoWidth; }
  get height(): number { return this.video.videoHeight; }
}
