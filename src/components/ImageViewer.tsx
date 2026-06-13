export default function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="image-viewer-bg"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <img src={src} style={{ maxWidth: "95vw", maxHeight: "90vh", borderRadius: 12, objectFit: "contain" }} alt="" />
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,.15)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>✕</button>
    </div>
  );
}
