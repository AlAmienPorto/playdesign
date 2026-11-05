import { useState } from 'react';
import { loginWithPassword, probeToken, setOfficeToken } from '../lib/api';

/**
 * Layar masuk. Dua jalur:
 * - password  → minta sesi bertanda tangan ke Worker (dipakai sehari-hari)
 * - API token → tempel token 64 hex (untuk mesin/script atau kalau password belum diset)
 * Kredensial divalidasi dulu ke API sebelum disimpan — kalau salah, halaman
 * TIDAK reload, cuma muncul pesan error, jadi bisa langsung coba lagi.
 */
export function TokenGate({ onReady, notice }: { onReady: () => void; notice?: string }) {
  const [mode, setMode] = useState<'password' | 'token'>('password');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const secret = value.trim();
    if (!secret) {
      setError(mode === 'password' ? 'Password belum diisi.' : 'Token belum diisi.');
      return;
    }
    if (mode === 'token' && secret.replace(/\s+/g, '').length < 16) {
      setError('Token terlalu pendek — tempel 64 karakter dari server.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (mode === 'password') {
        await loginWithPassword(secret);
      } else {
        const ok = await probeToken(secret.replace(/\s+/g, ''));
        if (!ok) {
          setError('Token ditolak. Periksa lagi — pastikan tidak ada karakter terpotong.');
          return;
        }
        setOfficeToken(secret);
      }
      window.dispatchEvent(new Event('pd-token-set'));
      onReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || 'Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.');
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
          {mode === 'password'
            ? 'Masuk dengan password workspace. Sesi berlaku 30 hari di perangkat ini.'
            : 'Tempel API token 64 karakter. Untuk mesin/script, atau kalau password belum diset.'}
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
          <label className="field-label" htmlFor="access-secret">
            {mode === 'password' ? 'Password' : 'Access token'}
          </label>
          <input
            id="access-secret"
            className="input"
            type="password"
            autoComplete={mode === 'password' ? 'current-password' : 'off'}
            spellCheck={false}
            placeholder={mode === 'password' ? 'password workspace' : '64 karakter hex'}
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

        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
          onClick={() => {
            setMode(mode === 'password' ? 'token' : 'password');
            setValue('');
            setError('');
          }}
        >
          {mode === 'password' ? 'Masuk pakai API token' : 'Kembali ke password'}
        </button>
      </form>
    </div>
  );
}
