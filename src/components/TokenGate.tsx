import { useState } from "react";
import { setOfficeToken } from "../lib/officeApi";
import { Button, Field, inputClass } from "./ui";

/**
 * Layar sekali-pakai untuk menempelkan token akses.
 * Token divalidasi dulu ke API sebelum disimpan — kalau salah, halaman TIDAK
 * reload, cuma muncul pesan error, jadi token bisa langsung ditempel ulang.
 */
export function TokenGate({ onReady }: { onReady: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = value.replace(/\s+/g, "");
    if (token.length < 16) {
      setError("Token terlalu pendek — tempel 64 karakter dari server.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const probe = await fetch("/api/office?workspace=playdesign", {
        headers: { "x-actor-id": "ja", authorization: `Bearer ${token}` },
      });
      if (probe.status === 401) {
        setError("Token ditolak. Periksa lagi — pastikan tidak ada karakter terpotong.");
        return;
      }
      if (!probe.ok) {
        setError(`Server membalas ${probe.status}. Coba beberapa saat lagi.`);
        return;
      }
      setOfficeToken(token);
      onReady();
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-line bg-surface-2 p-6 shadow-sm"
      >
        <div className="mb-1 text-sm font-semibold text-ink">Playdesign Office CRM</div>
        <p className="mb-5 text-xs leading-relaxed text-muted">
          Workspace ini terhubung ke database produksi. Tempel token akses sekali —
          tersimpan hanya di perangkat ini, tidak pernah dikirim ke mana pun selain
          API-nya sendiri.
        </p>

        <Field label="Access token">
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="64 karakter hex"
            value={value}
            disabled={busy}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
          />
        </Field>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <Button variant="primary" type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk"}
        </Button>
      </form>
    </div>
  );
}
