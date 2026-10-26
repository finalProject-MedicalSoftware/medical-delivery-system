'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import {
  Users, UserPlus, Pencil, Trash2, Power, CheckCircle2, AlertOctagon, X,
} from 'lucide-react';

type Row = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  active: boolean;
  created_at?: string;
};

const ROLES = ['ADMIN', 'FARMASI', 'OPERATOR'] as const;

const rolePill = (role: string) =>
  role === 'ADMIN' ? 'status-info' : role === 'FARMASI' ? 'status-success' : 'status-warning';

export default function UsersPage() {
  const { user, request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.users;
  const tc = dict.common;
  const locale = language === 'id' ? 'id-ID' : 'en-US';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('OPERATOR');
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<Row | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<string>('OPERATOR');
  const [editActive, setEditActive] = useState(true);
  const [editSaving, setEditSaving] = useState(false);

  const flash = (fn: (v: string | null) => void, msg: string | null) => {
    fn(msg);
    if (msg) setTimeout(() => fn(null), 4000);
  };

  const fetchUsers = () => {
    setLoading(true);
    request('users')
      .then((data: Row[]) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => flash(setError, err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const isSelf = (r: Row) => r.username === user?.username;

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    request('users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, fullName, password, role }),
    })
      .then(() => {
        flash(setSuccess, t.saveSuccess);
        setShowAdd(false);
        setUsername('');
        setFullName('');
        setPassword('');
        setRole('OPERATOR');
        fetchUsers();
      })
      .catch((err) => flash(setError, err.message))
      .finally(() => setSaving(false));
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setEditFullName(r.full_name);
    setEditRole((r.role || '').toUpperCase());
    setEditActive(!!r.active);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setSuccess(null);
    setEditSaving(true);
    request(`users/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: editFullName, role: editRole, active: editActive }),
    })
      .then(() => {
        flash(setSuccess, t.saveSuccess);
        setEditing(null);
        fetchUsers();
      })
      .catch((err) => flash(setError, err.message))
      .finally(() => setEditSaving(false));
  };

  const toggle = (r: Row) => {
    setError(null);
    setSuccess(null);
    request(`users/${r.id}/toggle`, { method: 'PATCH' })
      .then(() => fetchUsers())
      .catch((err) => flash(setError, err.message));
  };

  const remove = (r: Row) => {
    if (!window.confirm(t.deleteConfirm)) return;
    setError(null);
    setSuccess(null);
    request(`users/${r.id}`, { method: 'DELETE' })
      .then(() => {
        flash(setSuccess, t.deleteSuccess);
        fetchUsers();
      })
      .catch((err) => flash(setError, err.message));
  };

  const FIELD =
    'w-full bg-input border border-base rounded-lg px-3.5 py-2.5 text-sm txt-main outline-none focus:border-accent transition-colors';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <Users className="text-accent" size={24} />
            {t.title}
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <UserPlus size={14} /> {t.addUser}
        </button>
      </div>

      {error && (
        <div className="glass-panel p-4 border-error/40 bg-error/5 flex items-start gap-2">
          <AlertOctagon size={15} className="text-error shrink-0 mt-0.5" />
          <p className="text-xs text-error">{error}</p>
        </div>
      )}
      {success && (
        <div className="glass-panel p-4 border-success/40 bg-success/5 flex items-start gap-2">
          <CheckCircle2 size={15} className="text-success shrink-0 mt-0.5" />
          <p className="text-xs text-success">{success}</p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="glass-panel p-6 space-y-4">
          <h3 className="font-bold text-sm txt-main flex items-center gap-2 pb-3 border-b border-base">
            <UserPlus size={16} className="text-accent" /> {t.addUser}
          </h3>
          <form onSubmit={submitAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium">{t.username}</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={64}
                pattern="[A-Za-z0-9_.\-]+"
                className={FIELD}
                placeholder="operator02"
              />
              <p className="text-[10px] txt-sec">{t.usernameHint}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium">{t.fullName}</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={150}
                className={FIELD}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium">{tc.password}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={FIELD}
                autoComplete="new-password"
              />
              <p className="text-[10px] txt-sec">{t.passwordHint}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium">{t.role}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={FIELD}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary justify-center">
                {saving ? tc.loading : t.addUser}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2.5 rounded-lg text-xs font-medium bg-elevated txt-sec hover:bg-accent-muted transition-colors"
              >
                {tc.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel p-6 space-y-4">
        {loading ? (
          <p className="text-sm txt-sec text-center py-10">{tc.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm txt-sec text-center py-10">{tc.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-base txt-sec">
                  <th className="py-3 px-4">{t.username}</th>
                  <th className="py-3 px-4">{t.fullName}</th>
                  <th className="py-3 px-4">{t.role}</th>
                  <th className="py-3 px-4">{t.active}</th>
                  <th className="py-3 px-4 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base/60">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-elevated/40 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono txt-main">{r.username}</span>
                      {isSelf(r) && (
                        <span className="ml-2 text-[10px] txt-accent">({tc.you || 'you'})</span>
                      )}
                    </td>
                    <td className="py-3 px-4 txt-main">{r.full_name}</td>
                    <td className="py-3 px-4">
                      <span className={`status-pill ${rolePill((r.role || '').toUpperCase())}`}>
                        {(r.role || '').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`status-pill ${r.active ? 'status-success' : 'status-danger'}`}
                      >
                        {r.active ? tc.active : tc.inactive}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(r)}
                          title={tc.edit}
                          className="p-2 rounded-lg bg-elevated txt-sec hover:bg-accent-muted hover:text-accent transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggle(r)}
                          title={t.toggleActive}
                          disabled={isSelf(r)}
                          className="p-2 rounded-lg bg-elevated txt-sec hover:bg-warning/15 hover:text-warning transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Power size={13} />
                        </button>
                        <button
                          onClick={() => remove(r)}
                          title={t.deleteUser}
                          disabled={isSelf(r)}
                          className="p-2 rounded-lg bg-elevated txt-sec hover:bg-error/15 hover:text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-base">
              <h3 className="font-bold text-sm txt-main flex items-center gap-2">
                <Pencil size={16} className="text-accent" /> {t.title}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-lg txt-sec hover:bg-elevated transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs txt-sec font-medium">{t.username}</label>
                <input
                  value={editing.username}
                  disabled
                  className={`${FIELD} opacity-60 cursor-not-allowed`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs txt-sec font-medium">{t.fullName}</label>
                <input
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  maxLength={150}
                  className={FIELD}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs txt-sec font-medium">{t.role}</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className={FIELD}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2.5 text-xs txt-main cursor-pointer">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  disabled={isSelf(editing)}
                  className="w-4 h-4 accent-accent"
                />
                {t.active}
                {isSelf(editing) && (
                  <span className="txt-sec text-[10px]">· {t.selfGuard}</span>
                )}
              </label>
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={editSaving} className="btn-primary justify-center">
                  {editSaving ? tc.loading : tc.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2.5 rounded-lg text-xs font-medium bg-elevated txt-sec hover:bg-accent-muted transition-colors"
                >
                  {tc.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
