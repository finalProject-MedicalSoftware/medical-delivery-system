'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { User, KeyRound, CheckCircle2, AlertOctagon } from 'lucide-react';

export default function AccountPage() {
  const { user, request } = useApp();
  const { dict } = useLanguage();
  const t = dict.account;
  const ta = dict.auth;
  const tc = dict.common;

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // user comes from AppShell (auth/me); keep local fallback fetch for direct mount.
  const [profile, setProfile] = useState<any>(user);
  useEffect(() => {
    if (!user) request('auth/me').then(setProfile).catch(() => {});
  }, [user, request]);

  const role = ((profile?.role || user?.role || '') as string).toUpperCase();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError(t.newPasswordHint);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }
    setSaving(true);
    request('auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    })
      .then(() => {
        setSuccess(true);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const FIELD =
    'w-full bg-input border border-base rounded-lg px-3.5 py-2.5 text-sm txt-main outline-none focus:border-accent transition-colors';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6">
        <h2 className="text-xl font-bold txt-main flex items-center gap-2">
          <User className="text-accent" size={24} />
          {t.title}
        </h2>
        <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile */}
        <div className="glass-panel p-6 space-y-4">
          <h3 className="font-bold text-sm txt-main flex items-center gap-2 pb-3 border-b border-base">
            <User size={16} className="text-accent" /> {t.profile}
          </h3>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-accent-muted border border-accent flex items-center justify-center">
              <User size={26} className="text-accent" />
            </div>
            <div>
              <p className="text-base font-bold txt-main">{profile?.username}</p>
              <span className="status-pill status-info">{role || tc.unknown}</span>
            </div>
          </div>
          <dl className="text-xs space-y-2 pt-2">
            <div className="flex justify-between gap-4">
              <dt className="txt-sec">{ta.username}</dt>
              <dd className="font-mono txt-main">{profile?.username}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="txt-sec">{tc.role}</dt>
              <dd className="txt-main">{role || tc.unknown}</dd>
            </div>
          </dl>
        </div>

        {/* Change password */}
        <div className="glass-panel p-6 space-y-4">
          <h3 className="font-bold text-sm txt-main flex items-center gap-2 pb-3 border-b border-base">
            <KeyRound size={16} className="text-accent" /> {t.changePassword}
          </h3>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium">{ta.oldPassword}</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                className={FIELD}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium">{ta.newPassword}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className={FIELD}
                autoComplete="new-password"
              />
              <p className="text-[10px] txt-sec">{t.newPasswordHint}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium">{ta.confirmPassword}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={FIELD}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-xs text-error flex items-center gap-1.5">
                <AlertOctagon size={13} /> {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 size={13} /> {t.passwordSuccess}
              </p>
            )}

            <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
              {saving ? tc.loading : t.changePassword}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
