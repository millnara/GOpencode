import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import Icon from "./Icon";

type Props = {
  onResult: (raw: string) => void;
  onCancel: () => void;
};

export default function NativeQrScanner({ onResult, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Open the default rear camera straight away — probing every lens for
        // the "best" one takes seconds and leaves the user staring at a blank
        // frame. The OS default back camera is the main lens on Android.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message || "Could not start the camera";
        if (msg.includes("NotAllowed") || msg.includes("Permission")) {
          setError("Camera permission was denied. Open Settings → Apps → GOpencode → Permissions → Camera to enable.");
        } else {
          setError(msg);
        }
        return;
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const tick = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    // The square scan window shows the center crop of the frame (object-fit:
    // cover), so decode exactly that region — and cap it at 720px: jsQR is
    // both faster and more reliable on a moderate, denoised image than on a
    // full-res frame full of moiré from the monitor.
    const side = Math.min(w, h);
    const out = Math.min(side, 720);
    canvas.width = out;
    canvas.height = out;
    ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
    const imgData = ctx.getImageData(0, 0, out, out);
    const result = jsQR(imgData.data, out, out);
    if (result?.data) {
      close(result.data);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (!scanning) return;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning]);

  const close = (result?: string) => {
    setScanning(false);
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (result) {
      onResult(result);
    } else {
      onCancel();
    }
  };

  return (
    <div className="scanner-overlay">
      <div className="scanner-topbar">
        <button className="scanner-close" onClick={() => close()} aria-label="Close scanner">
          <Icon name="close" size={26} strokeWidth={2} />
        </button>
        <div className="scanner-title">Scan pairing QR</div>
        <div className="scanner-topbar-spacer" />
      </div>

      <div className="scanner-stage">
        <div className="scanner-window">
          <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
          {!scanning && !error && <div className="scanner-starting">Starting camera…</div>}
          <svg className="scanner-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x="1" y="1" width="98" height="98" rx="8" ry="8" fill="none" stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          {scanning && <div className="scanner-laser" />}
          <span className="scanner-cnr scanner-cnr-tl" />
          <span className="scanner-cnr scanner-cnr-tr" />
          <span className="scanner-cnr scanner-cnr-bl" />
          <span className="scanner-cnr scanner-cnr-br" />
        </div>
      </div>

      <div className="scanner-bottom">
        <div className="scanner-hint">
          Point the camera at the QR shown on your desktop
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {error && (
        <div className="scanner-error">
          <div className="scanner-error-tx">{error}</div>
          <button className="scanner-error-btn" onClick={() => close()}>Close</button>
        </div>
      )}
    </div>
  );
}
