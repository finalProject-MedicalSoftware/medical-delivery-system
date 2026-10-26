'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, LogIn, ShieldCheck, Bot } from 'lucide-react';
import { csrfHeaders } from '../lib/csrf';
import { useLanguage } from '../components/LanguageProvider';

export default function LoginPage() {
  const router = useRouter();
  const { dict } = useLanguage();
  const t = dict.login;
  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-lg mb-4">
            <Bot size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold txt-main">{t.title}</h1>
          <p className="text-sm txt-sec mt-1 text-center">{t.subtitle}</p>
        </div>

        <form onSubmit={submit} className="glass-panel p-8 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-xs font-semibold txt-sec uppercase tracking-wide">
              {dict.auth.username}
            </label>
            <div className="relative">
              <LockKeyhole size={16} className="absolute left-3 top-1/2 -translate-y-1/2 txt-sec pointer-events-none" />
              <input
                id="username" type="text" required autoComplete="username"
                value={username} onChange={(e) => setUsername(e.target.value)}
                className="input-field pl-10" placeholder={dict.auth.username}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-semibold txt-sec uppercase tracking-wide">
              {dict.auth.password}
            </label>
            <input
              id="password" type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-field" placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="status-pill status-danger inline-flex items-center gap-1.5 px-3 py-1.5">
              <ShieldCheck size={12} /> {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
            <LogIn size={16} /> {busy ? t.signingIn : t.signIn}
          </button>

          <p className="text-xs text-center txt-sec">{t.demoHint}</p>
        </form>
      </div>
    </div>
  );
}
