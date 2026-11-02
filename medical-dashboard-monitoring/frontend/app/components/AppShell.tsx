'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot, LayoutDashboard, Activity, ClipboardList, Database,
  Map as MapIcon, Settings, ChevronLeft, ChevronRight, Menu,
  Radio, Battery, BatteryCharging, LucideIcon,
  Users as UsersIcon, FileText, Bell, UserCircle, Cpu,
} from 'lucide-react';
import { WS_RELAY_PATH } from '../lib/ws-config';
import { csrfHeaders } from '../lib/csrf';
import { useLanguage } from './LanguageProvider';
import LanguageSwitcher from './LanguageSwitcher';
import UserDropdown from './UserDropdown';

export interface RobotTelemetry {
  robotId: string;
  name: string;
  status: string; // IDLE, NAVIGATING, CHARGING, ERROR
  mode: string;
  battery: number;
  pose: { x: number; y: number; yaw: number };
  speed: number;
  activeMissionId: string | null;
  queueLength: number;
  simulated: boolean;
  lastSeen: string;
}

export interface CommandResult {
  commandId: string;
  result: 'OK' | 'REJECTED';
  reason: string;
}

export interface MissionEvent {
  status: string;
  message?: string;
  missionId?: number;
  progress?: number;
  eventId?: string;
  timestamp?: string;
}

interface AppContextType {
  user: { username: string; role: string } | null;
  logout: () => Promise<void>;
  telemetry: RobotTelemetry;
  backendConnected: boolean;
  simrsStatus: string;
  wsConnected: boolean;
  lastCommandResult: CommandResult | null;
  missionEvents: MissionEvent[];
  request: (path: string, init?: RequestInit) => Promise<any>;
}

const defaultTelemetry: RobotTelemetry = {
  robotId: 'NEVO-01',
  name: 'Robot Pengantar Obat NEVO #1',
  status: 'IDLE',
  mode: 'AUTONOMOUS',
  battery: 95.0,
  pose: { x: -5.0, y: -5.0, yaw: 0.0 },
  speed: 0.0,
  activeMissionId: null,
  queueLength: 0,
  simulated: true,
  lastSeen: new Date().toISOString(),
};

const AppContext = createContext<AppContextType>({
  user: null,
  logout: async () => {},
  telemetry: defaultTelemetry,
  backendConnected: false,
  simrsStatus: 'UNKNOWN',
  wsConnected: false,
  lastCommandResult: null,
  missionEvents: [],
  request: async () => ({}),
});

export const useApp = () => useContext(AppContext);

/* ------------------------------------------------------------ Sidebar */

const ROLE_ALL = ['ADMIN', 'FARMASI', 'OPERATOR'];
type Role = (typeof ROLE_ALL)[number];

interface NavItem {
  href: string;
  labelKey: 'dashboard' | 'missions' | 'tracking' | 'robots' | 'robotRegistry' | 'maps' | 'simrs' | 'users' | 'reports' | 'notifications' | 'account' | 'settings';
  icon: LucideIcon;
  roles: Role[];
}

const NAV_SECTIONS: { sectionKey: 'sectionOps' | 'sectionSystem'; items: NavItem[] }[] = [
  {
    sectionKey: 'sectionOps',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: ROLE_ALL },
      { href: '/missions', labelKey: 'missions', icon: ClipboardList, roles: ROLE_ALL },
      { href: '/tracking', labelKey: 'tracking', icon: Activity, roles: ROLE_ALL },
      { href: '/robots', labelKey: 'robots', icon: Bot, roles: ROLE_ALL },
      { href: '/simrs', labelKey: 'simrs', icon: Database, roles: ROLE_ALL },
    ],
  },
  {
    sectionKey: 'sectionSystem',
    items: [
      { href: '/maps', labelKey: 'maps', icon: MapIcon, roles: ['ADMIN'] },
      { href: '/robots/registry', labelKey: 'robotRegistry', icon: Cpu, roles: ['ADMIN'] },
      { href: '/users', labelKey: 'users', icon: UsersIcon, roles: ['ADMIN'] },
      { href: '/reports', labelKey: 'reports', icon: FileText, roles: ROLE_ALL },
      { href: '/notifications', labelKey: 'notifications', icon: Bell, roles: ROLE_ALL },
      { href: '/account', labelKey: 'account', icon: UserCircle, roles: ROLE_ALL },
      { href: '/settings', labelKey: 'settings', icon: Settings, roles: ['ADMIN'] },
    ],
  },
];

function SidebarLink({
  href, label, icon: Icon, collapsed, active, onClick,
}: {
  href: string; label: string; icon: LucideIcon; collapsed: boolean; active: boolean; onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`relative flex items-center rounded-xl transition-all duration-200 shrink-0 ${
        collapsed ? 'w-12 h-12 justify-center mx-auto' : 'gap-3 px-3 py-2.5'
      } ${
        active
          ? 'bg-white text-[#0a0a0a] font-semibold shadow-sm'
          : 'text-neutral-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-accent rounded-l-full" />
      )}
      <Icon size={20} className="shrink-0" />
      {!collapsed && <span className="text-sm truncate">{label}</span>}
    </Link>
  );
}

function StatusChip({ label, ok, text }: { label: string; ok: boolean; text?: string }) {
  return (
    <span className={`status-pill flex items-center gap-1.5 ${ok ? 'status-success' : 'status-danger'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-success' : 'bg-error'}`} />
      {label}{text ? ` · ${text}` : ''}
    </span>
  );
}

/* ------------------------------------------------------------ Shell */

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppContextType['user']>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // pathname yang sudah selesai dicek auth-nya; guard redirect hanya boleh
  // menendang jika cek untuk pathname AKTIF sudah selesai (hindari race
  // antara reset authChecked dan guard pada commit navigasi yang sama).
  const [authFor, setAuthFor] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<RobotTelemetry>(defaultTelemetry);
  const [backendConnected, setBackendConnected] = useState(false);
  const [simrsStatus, setSimrsStatus] = useState('UNKNOWN');
  const [wsConnected, setWsConnected] = useState(false);
  const [wsEnabled, setWsEnabled] = useState(false);
  const [lastCommandResult, setLastCommandResult] = useState<AppContextType['lastCommandResult']>(null);
  const [missionEvents, setMissionEvents] = useState<MissionEvent[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { dict } = useLanguage();

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const doFetch = () => {
      const headers = new Headers(init.headers);
      for (const [key, value] of Object.entries(csrfHeaders())) headers.set(key, value);
      return fetch(`/api/proxy/${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
    };
    let res = await doFetch();
    // Token CSRF bisa hilang/berotasi di cookie browser — refresh sekali lalu ulang.
    if (res.status === 403 && init.method && init.method !== 'GET') {
      await fetch('/api/proxy/auth/csrf', { credentials: 'include', cache: 'no-store' }).catch(() => {});
      res = await doFetch();
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = typeof data === 'string' ? data : data.message || data.error || JSON.stringify(data);
      throw new Error(err);
    }
    return data;
  }, []);

  useEffect(() => {
    // Reset authChecked tiap perubahan route: cek /auth/me untuk route BARU
    // harus selesai sebelum guard redirect (di bawah) boleh menendang ke /login.
    if (pathname === '/login') { setUser(null); setAuthChecked(true); setAuthFor(pathname); return; }
    setAuthChecked(false);
    let cancelled = false;
    fetch('/api/proxy/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => res.ok ? setUser(await res.json()) : setUser(null))
      .catch(() => setUser(null))
      .finally(() => { if (!cancelled) { setAuthChecked(true); setAuthFor(pathname); } });
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (authFor === pathname && authChecked && pathname !== '/login' && !user) router.replace('/login');
  }, [authFor, authChecked, pathname, user, router]);

  const logout = async () => {
    await fetch('/api/proxy/auth/logout', { method: 'POST', credentials: 'include', headers: csrfHeaders() });
    setUser(null);
    router.replace('/login');
  };

  // Poll robot REST state once on mount
  useEffect(() => {
    if (!user) return; // jangan poll di /login / sebelum auth — hindari 403 spam
    const refresh = () => {
      request('robots').then((list: any[]) => {
        setBackendConnected(true);
        if (list?.[0]) setTelemetry(list[0]);
      }).catch(() => setBackendConnected(false));
      request('integrations/simrs/status').then((status: any) => setSimrsStatus(status?.code || status?.lastSyncStatus || 'UNKNOWN')).catch(() => setSimrsStatus('BACKEND_OFFLINE'));
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [user, request]);

  // SSE relay — BFF memegang koneksi WS ke medical-ws (Bearer server-side, lihat /api/ws/stream).
  // Session relay dikendalikan operator melalui /settings; browser tidak membuka stream implisit.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/ws/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((session) => { if (!cancelled) setWsEnabled(session.conn?.on === true); })
      .catch(() => { if (!cancelled) setWsEnabled(false); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const refreshSession = () => {
      fetch('/api/ws/session', { cache: 'no-store' })
        .then((response) => response.json())
        .then((session) => setWsEnabled(session.conn?.on === true))
        .catch(() => setWsEnabled(false));
    };
    window.addEventListener('nevo:ws-session-changed', refreshSession);
    return () => window.removeEventListener('nevo:ws-session-changed', refreshSession);
  }, []);

  useEffect(() => {
    if (!user || !wsEnabled) {
      setWsConnected(false);
      return;
    }
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es = new EventSource(WS_RELAY_PATH);
      es.onopen = () => {
        setWsConnected(true);
        // Reconcile robot state setelah reconnect.
        request('robots').then((list: any[]) => {
          setBackendConnected(true);
          if (list?.[0]) setTelemetry(list[0]);
        }).catch(() => setBackendConnected(false));
      };

      es.onmessage = (event) => {
        try {
          const env = JSON.parse(event.data);
          if (env.type === 'TELEMETRY' && env.data) {
            setTelemetry(env.data);
          } else if (env.type === 'ROBOT_COMMAND_RESULT' && env.data) {
            setLastCommandResult(env.data);
          } else if (env.type === 'MISSION_EVENT' && env.data) {
            setMissionEvents((previous) => [env.data, ...previous].slice(0, 120));
          }
        } catch {
          // ignore
        }
      };

      // EventSource berhenti permanen pada non-200 (sesi OFF = 409) — retry manual.
      es.onerror = () => {
        setWsConnected(false);
        es?.close();
        timer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [user, request, wsEnabled]);

  // Tutup drawer mobile saat pindah rute
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Restore collapse state
  useEffect(() => {
    const saved = localStorage.getItem('nevo_sidebar_collapsed');
    if (saved === 'true') setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('nevo_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  if (pathname === '/login') return <>{children}</>;
  if (!authChecked || !user) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-12 h-12 skeleton rounded-xl" />
      </div>
    );
  }

  const role = (user.role || '').toUpperCase() as Role;
  const simrsOk = simrsStatus !== 'UNKNOWN' && simrsStatus !== 'BACKEND_OFFLINE';

  return (
    <AppContext.Provider
      value={{
        user,
        logout,
        telemetry,
        backendConnected,
        simrsStatus,
        wsConnected,
        lastCommandResult,
        missionEvents,
        request,
      }}
    >
      <div className="flex h-screen bg-page text-txt-main overflow-hidden font-sans">
        {/* Mobile overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <aside
          className={`fixed md:relative z-50 h-full bg-[#121212] flex flex-col shrink-0 sidebar-transition
            ${sidebarCollapsed ? 'w-64 md:w-20' : 'w-64'}
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        >
          {/* Logo */}
          <div className={`px-4 py-5 border-b border-white/10 flex items-center ${sidebarCollapsed ? 'md:justify-center' : 'gap-3'}`}>
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-white shadow-sm shrink-0">
              <Bot size={21} />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 sidebar-copy">
                <h1 className="font-bold text-sm text-white tracking-tight flex items-center gap-2">
                  NEVO
                  <span className="text-[10px] text-neutral-300 bg-white/10 border border-white/20 px-1.5 py-0.5 rounded-md font-mono">v1.0</span>
                </h1>
                <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{dict.header.product}</p>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {NAV_SECTIONS.map((section) => {
              const items = section.items.filter((it) => it.roles.includes(role));
              if (!items.length) return null;
              return (
                <div key={section.sectionKey}>
                  {sidebarCollapsed ? (
                    <div className="h-px bg-white/10 my-3 mx-2" />
                  ) : (
                    <p className="px-3 mb-1.5 mt-4 first:mt-0 text-[10px] font-mono font-bold tracking-widest text-neutral-600 uppercase">
                      {dict.sidebar[section.sectionKey]}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {items.map((it) => (
                      <SidebarLink
                        key={it.href}
                        href={it.href}
                        label={dict.sidebar[it.labelKey]}
                        icon={it.icon}
                        collapsed={sidebarCollapsed}
                        active={pathname === it.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Collapse toggle (desktop) */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? dict.sidebar.expand : dict.sidebar.collapse}
            className="hidden md:flex items-center gap-3 px-3 py-3 mx-3 mb-3 rounded-xl text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            {!sidebarCollapsed && <span className="text-sm">{dict.sidebar.expand}</span>}
          </button>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Header */}
          <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border-base px-4 md:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-2 rounded-lg text-txt-sec hover:bg-bg-elevated transition-colors"
                aria-label={dict.header.menu}
              >
                <Menu size={20} />
              </button>

              <span className={`status-pill flex items-center gap-1.5 shrink-0 ${telemetry.simulated ? 'status-warning' : 'status-success'}`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${telemetry.simulated ? 'bg-warning' : 'bg-success'}`} />
                {telemetry.simulated ? dict.common.simulated : dict.common.live}
              </span>
              <span className="hidden sm:block text-xs text-txt-sec truncate">{dict.header.monitoring}</span>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <div className="hidden lg:flex items-center gap-2">
                <StatusChip label={dict.header.ws} ok={wsConnected} />
                <StatusChip label={dict.header.backend} ok={backendConnected} />
                <StatusChip label={dict.header.simrs} ok={simrsOk} text={simrsOk ? simrsStatus : undefined} />
              </div>

              {/* Telemetry quick view */}
              <div className="hidden md:flex items-center gap-3 text-xs text-txt-sec bg-bg-elevated px-3 py-1.5 rounded-xl border border-border-base">
                <span className="flex items-center gap-1">
                  <Radio size={14} className={telemetry.status === 'NAVIGATING' ? 'text-info animate-pulse' : 'text-txt-sec'} />
                  <strong className="font-mono text-txt-main">{telemetry.status}</strong>
                </span>
                <span className="text-border-base">|</span>
                <span className="flex items-center gap-1">
                  {telemetry.battery > 20 ? (
                    <Battery size={15} className="text-success" />
                  ) : (
                    <BatteryCharging size={15} className="text-error" />
                  )}
                  <strong className="font-mono text-txt-main">{telemetry.battery.toFixed(1)}%</strong>
                </span>
                <span className="text-border-base">|</span>
                <span className="font-mono text-[11px] text-txt-sec">
                  ({telemetry.pose.x.toFixed(2)}m, {telemetry.pose.y.toFixed(2)}m)
                </span>
              </div>

              <LanguageSwitcher />
              <UserDropdown username={user.username} role={user.role} onLogoutClick={logout} />
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
