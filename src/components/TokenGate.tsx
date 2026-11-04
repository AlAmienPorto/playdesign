import { useState } from 'react';
import { probeToken, setOfficeToken } from '../lib/api';

/**
 * Layar sekali-pakai untuk menempelkan token akses.
 * Token divalidasi dulu ke API sebelum disimpan — kalau salah, halaman TIDAK
 * reload, cuma muncul pesan error, jadi token bisa langsung ditempel ulang.
 */
export function TokenGate({ onReady, notice }: { onReady: () => void; notice?: string }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = value.replace(/\s+/g, '');
    if (token.length < 16) {
      setError('Token terlalu pendek — tempel 64 karakter dari server.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const ok = await probeToken(token);
      if (!ok) {
        setError('Token ditolak. Periksa lagi — pastikan tidak ada karakter terpotong.');
        return;
      }
      setOfficeToken(token);
      window.dispatchEvent(new Event('pd-token-set'));
      onReady();
    } catch {
      setError('Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '24px',
      }}
    >
      <form
        onSubmit={submit}
        className="card"
        style={{ width: '100%', maxWidth: '440px', padding: '28px' }}
      >
        <div style={{ marginBottom: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
          Playdesign Office CRM
        </div>
        <p style={{ marginBottom: '20px', fontSize: '12px', lineHeight: 1.6, color: 'var(--muted)' }}>
          Workspace ini terhubung ke database produksi. Tempel token akses sekali — tersimpan
          hanya di perangkat ini, tidak pernah dikirim ke mana pun selain API-nya sendiri.
        </p>

        {notice && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              lineHeight: 1.55,
              color: 'var(--ink)',
              background: 'var(--warn-soft, #fef3c7)',
              border: '1px solid var(--warn, #f59e0b)',
            }}
          >
            {notice}
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="access-token">
            Access token
          </label>
          <input
            id="access-token"
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="64 karakter hex"
            value={value}
            disabled={busy}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
          />
        </div>

        {error && (
          <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger)' }}>{error}</p>
        )}

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: '16px' }}>
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
