// Dev/test-only synthetic camera: replaces getUserMedia with a canvas
// captureStream so headless Chrome (whose fake-device capture service is
// flaky on macOS) can exercise the real video -> tracker -> WebGL pipeline.
// Activated only via the ?fakecam=1 URL param — never in normal use.
export function installFakeCamera(): void {
  const cv = document.createElement('canvas');
  cv.width = 1280;
  cv.height = 720;
  const c = cv.getContext('2d')!;
  let t = 0;
  setInterval(() => {
    t += 1 / 30;
    const hue = Math.floor((t * 40) % 360);
    c.fillStyle = `hsl(${hue}, 60%, 35%)`;
    c.fillRect(0, 0, cv.width, cv.height);
    // moving bar + corner marker make mirroring and motion visible
    const x = (t * 200) % cv.width;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(x, 0, 60, cv.height);
    c.fillStyle = '#ff3355';
    c.fillRect(0, 0, 120, 120); // top-LEFT marker (appears top-RIGHT when mirrored)
    c.fillStyle = '#ffffff';
    c.font = 'bold 64px monospace';
    c.fillText('FAKE CAM', 480, 380);
  }, 1000 / 30);

  let stream = cv.captureStream(30);
  navigator.mediaDevices.getUserMedia = () => {
    // camera.stop() ends the tracks; hand out a fresh capture if that happened
    // (headless verification only ever starts once, but keep restart working).
    if (stream.getVideoTracks().every(t => t.readyState === 'ended')) {
      stream = cv.captureStream(30);
    }
    return Promise.resolve(stream);
  };
}
