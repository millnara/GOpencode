import { useEffect, useState } from "react";
import { checkPin, setPin, hasPin, clearPin, setUnlockTs } from "../lib/settings";

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPinEntry] = useState("");
  const [setup, setSetup] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"unlock" | "create">("unlock");

  useEffect(() => { hasPin().then(h => { if (!h) { setMode("create"); setSetup(true); } }); }, []);

  const submit = async () => {
    if (mode === "create") {
      if (pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
      if (!setup) {
        setConfirm(pin);
        setPinEntry("");
        setSetup(true);
        setError("");
        return;
      }
      if (pin !== confirm) { setError("PINs don't match"); setPinEntry(""); setSetup(false); return; }
      await setPin(pin);
      await setUnlockTs();
      setError(""); onUnlock();
      return;
    }
    const ok = await checkPin(pin);
    if (ok) { await setUnlockTs(); setError(""); onUnlock(); }
    else { setError("Wrong PIN"); setPinEntry(""); }
  };

  const doClear = async () => { await clearPin(); setMode("create"); setSetup(false); setPinEntry(""); setConfirm(""); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-.02em" }}>
        {mode === "create" ? (!setup ? "Set a PIN" : "Confirm PIN") : "Unlock"}
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 6, marginBottom: 24, textAlign: "center" }}>
        {mode === "create" ? "Protect your app with a 4+ digit PIN" : "Enter your PIN to continue"}
      </p>
      <input
        type="password" inputMode="numeric" maxLength={6} autoFocus
        style={{ width: 200, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 18px", color: "var(--text)", fontSize: 24, textAlign: "center", letterSpacing: "8px", outline: "none", fontFamily: "var(--mono)" }}
        value={pin} onChange={(e) => { setPinEntry(e.target.value.replace(/\D/g, "")); setError(""); }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="····"
      />
      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      <button className="btn" style={{ width: 200, marginTop: 16 }}
        disabled={pin.length < 4} onClick={submit}>
        {mode === "create" ? (setup ? "Confirm" : "Set PIN") : "Unlock"}
      </button>
      {mode === "unlock" && (
        <button style={{ marginTop: 16, color: "var(--fade)", fontSize: 12 }} onClick={doClear}>Reset PIN</button>
      )}
    </div>
  );
}
