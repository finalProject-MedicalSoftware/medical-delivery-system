'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, LogIn, ShieldCheck, Eye, EyeOff, User } from 'lucide-react';
import { NevoBrand, RobotArtwork } from '../components/NevoUI';
import { useLanguage } from '../components/LanguageProvider';

export default function LoginPage() {
  const router = useRouter();
  const { dict, language } = useLanguage();
  const t = dict.login;
  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      // CSRF: pakai token dari body /csrf — dijamin sama dengan cookie yang baru terbit,
      // tidak bergantung pada cookie yang sudah terbaca via document.cookie.
      const csrf = await fetch('/api/proxy/auth/csrf', { credentials: 'include' }).then(r => r.json());
      const response = await fetch('/api/proxy/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrf.token },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || t.invalidCredentials);
        return;
      }
      router.replace('/dashboard');
    } catch {
      setError(dict.common.backendOffline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <NevoBrand />
        <h1>{language === 'id' ? 'Sistem Kendali & Monitoring Robot Pengantar Obat' : 'Medicine Delivery Robot Control & Monitoring'}</h1>
        <p>{language === 'id' ? 'Distribusi obat yang lebih aman, terkendali, dan efisien di lingkungan rumah sakit.' : 'Safer, controlled and efficient medicine delivery throughout the hospital.'}</p>
        <RobotArtwork className="login-art" />
      </section>
      <form onSubmit={submit} className="glass-panel login-form">
        <h2>{language === 'id' ? 'Masuk ke NEVO' : 'Sign in to NEVO'}</h2>
        <p>{language === 'id' ? 'Masukkan akun Anda untuk melanjutkan' : 'Enter your account to continue'}</p>
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium">{dict.auth.username}</label>
            <div className="relative"><User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 txt-sec pointer-events-none" />
              <input id="username" type="text" required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="input-field !pl-12" placeholder={dict.auth.username} />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium">{dict.auth.password}</label>
            <div className="relative"><LockKeyhole size={20} className="absolute left-4 top-1/2 -translate-y-1/2 txt-sec pointer-events-none" />
              <input id="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field !pl-12 !pr-12" placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 txt-sec" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
            </div>
          </div>
          {error && <div role="alert" className="rounded-xl bg-error/10 text-error p-3 text-sm flex gap-2"><ShieldCheck size={18} />{error}</div>}
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-3"><LogIn size={22} />{busy ? t.signingIn : t.signIn}</button>
        <p className="text-xs text-center !mb-0 !mt-5">{t.demoHint}</p>
      </form>
    </div>
  );
}
