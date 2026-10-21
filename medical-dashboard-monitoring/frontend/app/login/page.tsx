'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/proxy/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login gagal');
      router.replace('/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Login gagal'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-5">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-sky-500/15 text-sky-400 flex items-center justify-center"><ShieldCheck size={30} /></div>
        <h1 className="mt-4 text-2xl font-bold text-white">Login NEVO</h1>
        <p className="text-sm text-slate-400 mt-1">Role ditentukan oleh akun yang berhasil login.</p>
      </div>
      <label className="block text-sm text-slate-300">Username
        <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" className="mt-2 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white outline-none focus:border-sky-500" />
      </label>
      <label className="block text-sm text-slate-300">Password
        <div className="relative mt-2"><LockKeyhole size={16} className="absolute left-3 top-3 text-slate-500" /><input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className="w-full rounded-lg bg-slate-900 border border-slate-700 pl-9 pr-3 py-2 text-white outline-none focus:border-sky-500" /></div>
      </label>
      {error && <p className="rounded-lg bg-rose-950/60 border border-rose-800 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 py-2.5 font-semibold text-white flex items-center justify-center gap-2"><LogIn size={17} />{busy ? 'Memproses...' : 'Login'}</button>
      <p className="text-center text-xs text-slate-500">Akun admin/operator dikonfigurasi di environment backend.</p>
    </form>
  </main>;
}
