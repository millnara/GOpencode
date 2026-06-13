import { useCallback, useRef, useState } from "react";

const THRESHOLD = 64;

export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: React.ReactNode }) {
  const [pulling, setPulling] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    if (containerRef.current && containerRef.current.scrollTop > 0) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPulling(Math.min(dy, THRESHOLD * 1.5));
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (pulling >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPulling(THRESHOLD);
      try { await onRefresh(); } catch { /* */ }
      setRefreshing(false);
    }
    setPulling(0);
  }, [pulling, refreshing, onRefresh]);

  const offset = refreshing ? THRESHOLD * 0.6 : pulling * 0.5;
  const showIndicator = pulling > 10 || refreshing;

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {showIndicator && (
        <div style={{ height: offset, transition: refreshing ? "height .2s" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {refreshing && <div className="spinner" style={{ width: 20, height: 20 }} />}
          {!refreshing && pulling >= THRESHOLD && <span style={{ fontSize: 11, color: "var(--muted)" }}>Release to refresh</span>}
          {!refreshing && pulling < THRESHOLD && pulling > 10 && <span style={{ fontSize: 11, color: "var(--fade)" }}>Pull to refresh</span>}
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}
