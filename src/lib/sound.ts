// Completion chime via WebAudio (no asset needed). One of "their best bits".
let ctx: AudioContext | null = null;
export function playDone(): void {
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const notes = [880, 1175]; // A5 -> D6, a pleasant little two-note rise
    notes.forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const t = now + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx!.destination);
      o.start(t); o.stop(t + 0.2);
    });
  } catch { /* audio not available */ }
}
