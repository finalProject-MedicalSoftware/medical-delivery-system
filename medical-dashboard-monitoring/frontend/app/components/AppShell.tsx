'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot, LayoutDashboard, Activity, ClipboardList, Database,
  Map as MapIcon, Settings, ChevronLeft, ChevronRight, Menu,
  Radio, Battery, BatteryCharging, LucideIcon,
  Users as UsersIcon, Bell, UserCircle, Cpu,
} from 'lucide-react';
import { WS_RELAY_PATH } from '../lib/ws-config';
import { csrfHeaders } from '../lib/csrf';
import { useLanguage } from './LanguageProvider';
import LanguageSwitcher from './LanguageSwitcher';
import UserDropdown from './UserDropdown';
import { NevoBrand } from './NevoUI';

export interface RobotTelemetry {
  robotId: string;
  name: string;
  model: string;
  status: string; // IDLE, NAVIGATING, CHARGING, ERROR
  mode: string;
  battery: number;
  pose: { x: number; y: number; yaw: number };
  speed: number;
  activeMissionId: string | null;
  queueLength: number;
  compartmentCount?: number;
  simulated: boolean;
  lastSeen: string;
  telemetryAvailable: boolean;
}

export interface CommandResult {
  commandId: string;
  result: 'OK' | 'REJECTED';
  reason: string;
  robotId?: string;
}

export interface MissionEvent {
  status: string;
  message?: string;
  missionId?: number;
  progress?: number;
  eventId?: string;
  timestamp?: string;
  robotId?: string;
}

interface AppContextType {
  user: { username: string; role: string } | null;
  logout: () => Promise<void>;
  telemetry: RobotTelemetry;
  robots: RobotTelemetry[];
  selectedRobotId: string;
  selectRobot: (robotId: string) => void;
  selectedRobotConnected: boolean;
  selectedRobotHasTelemetry: boolean;
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
  model: '',
  status: 'IDLE',
  mode: 'AUTONOMOUS',
  battery: 95.0,
  pose: { x: -5.0, y: -5.0, yaw: 0.0 },
  speed: 0.0,
  activeMissionId: null,
  queueLength: 0,
  compartmentCount: 0,
  simulated: true,
  lastSeen: new Date().toISOString(),
  telemetryAvailable: false,
};

function normalizeRobot(raw: any, fallback: RobotTelemetry = defaultTelemetry): RobotTelemetry {
  const pose = raw?.pose && typeof raw.pose === 'object' ? raw.pose : fallback.pose;
  return {
    robotId: String(raw?.robotId ?? raw?.robot_id ?? fallback.robotId),
    name: String(raw?.name ?? fallback.name),
    model: String(raw?.model ?? fallback.model ?? ''),
    status: String(raw?.status ?? fallback.status),
    mode: String(raw?.mode ?? fallback.mode ?? 'UNKNOWN'),
    battery: Number.isFinite(Number(raw?.battery)) ? Number(raw.battery) : fallback.battery,
    pose: {
      x: Number.isFinite(Number(pose?.x)) ? Number(pose.x) : fallback.pose.x,
      y: Number.isFinite(Number(pose?.y)) ? Number(pose.y) : fallback.pose.y,
      yaw: Number.isFinite(Number(pose?.yaw)) ? Number(pose.yaw) : fallback.pose.yaw,
    },
    speed: Number.isFinite(Number(raw?.speed)) ? Number(raw.speed) : fallback.speed,
    activeMissionId: raw?.activeMissionId ?? fallback.activeMissionId ?? null,
    queueLength: Number.isFinite(Number(raw?.queueLength)) ? Number(raw.queueLength) : fallback.queueLength,
    compartmentCount: Number.isFinite(Number(raw?.compartmentCount)) ? Number(raw.compartmentCount) : fallback.compartmentCount,
    simulated: raw?.simulated === true,
    lastSeen: String(raw?.lastSeen ?? fallback.lastSeen),
    telemetryAvailable: raw?.telemetryAvailable === true || (raw?.battery != null && raw?.pose != null),
  };
}

const AppContext = createContext<AppContextType>({
  user: null,
  logout: async () => {},
  telemetry: defaultTelemetry,
  robots: [],
  selectedRobotId: '',
  selectRobot: () => {},
  selectedRobotConnected: false,
  selectedRobotHasTelemetry: false,
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
  labelKey: 'navigation' | 'dashboard' | 'missions' | 'tracking' | 'robots' | 'robotRegistry' | 'maps' | 'simrs' | 'users' | 'notifications' | 'account' | 'settings';
  icon: LucideIcon;
  roles: Role[];
}

const NAV_SECTIONS: { sectionKey: 'sectionOps' | 'sectionSystem'; items: NavItem[] }[] = [
  { sectionKey: 'sectionOps', items: [
    { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: ROLE_ALL },
    { href: '/missions', labelKey: 'missions', icon: ClipboardList, roles: ROLE_ALL },
    { href: '/missions/create', labelKey: 'navigation', icon: Activity, roles: ROLE_ALL },
    { href: '/tracking', labelKey: 'tracking', icon: Radio, roles: ROLE_ALL },
    { href: '/maps', labelKey: 'maps', icon: MapIcon, roles: ['ADMIN'] },
    { href: '/robots', labelKey: 'robots', icon: Bot, roles: ROLE_ALL },
    { href: '/robots/registry', labelKey: 'robotRegistry', icon: Cpu, roles: ['ADMIN', 'OPERATOR'] },
    { href: '/notifications', labelKey: 'notifications', icon: Bell, roles: ROLE_ALL },
  ] },
  { sectionKey: 'sectionSystem', items: [
    { href: '/settings', labelKey: 'settings', icon: Settings, roles: ROLE_ALL },
  ] },
];

function SidebarLink({
  href, label, icon: Icon, collapsed, active, onClick,
}: {
  href: string; label: string; icon: LucideIcon; collapsed: boolean; active: boolean; onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`relative flex items-center rounded-xl transition-all duration-200 shrink-0 ${
        collapsed ? 'w-12 h-12 justify-center mx-auto' : 'gap-3 px-3 py-2.5'
      } ${
        active
          ? 'bg-white text-accent font-semibold shadow-sm'
          : 'text-white hover:bg-white/10'
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
  const [authUnavailable, setAuthUnavailable] = useState(false);
  // pathname yang sudah selesai dicek auth-nya; guard redirect hanya boleh
  // menendang jika cek untuk pathname AKTIF sudah selesai (hindari race
  // antara reset authChecked dan guard pada commit navigasi yang sama).
  const [authFor, setAuthFor] = useState<string | null>(null);
  const [robots, setRobots] = useState<RobotTelemetry[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState('');
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

  const telemetry = useMemo(
    () => robots.find((robot) => robot.robotId === selectedRobotId) ?? defaultTelemetry,
    [robots, selectedRobotId],
  );
  const selectedRobotConnected = backendConnected && Boolean(selectedRobotId) && telemetry.status !== 'OFFLINE';
  const selectedRobotHasTelemetry = selectedRobotConnected && telemetry.telemetryAvailable;

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

  const applyRobotList = useCallback((list: any[]) => {
    const normalized = (Array.isArray(list) ? list : []).map((robot) => {
      const offlineFallback = { ...defaultTelemetry, robotId: String(robot?.robotId ?? robot?.robot_id ?? ''), name: String(robot?.name ?? robot?.robotId ?? 'NEVO'), status: 'OFFLINE', mode: 'UNKNOWN', battery: 0, simulated: false };
      return normalizeRobot(robot, offlineFallback);
    }).filter((robot) => robot.robotId);
    setRobots(normalized);
    setSelectedRobotId((current) => {
      const saved = current || localStorage.getItem('nevo_selected_robot_id') || '';
      return normalized.some((robot) => robot.robotId === saved) ? saved : (normalized[0]?.robotId ?? '');
    });
  }, []);

  const refreshRobots = useCallback(async () => {
    try {
      const list = await request('robots');
      setBackendConnected(true);

      // Status/telemetry berasal dari /robots, sedangkan model resmi robot
      // tersimpan di registry. Gabungkan berdasarkan robotId agar label
      // pemilih robot konsisten dengan halaman Daftar Robot.
      const registry = await request('robots/registry').catch(() => []);
      const modelByRobotId = new Map<string, string>(
        (Array.isArray(registry) ? registry : []).map((robot: any) => [
          String(robot?.robotId ?? robot?.robot_id ?? ''),
          String(robot?.model ?? ''),
        ]),
      );
      const inactiveIds = new Set<string>(
        (Array.isArray(registry) ? registry : [])
          .filter((robot: any) => ['DISABLED', 'ARCHIVED'].includes(String(robot?.registrationStatus ?? '')))
          .map((robot: any) => String(robot?.robotId ?? '')),
      );
      const enriched = (Array.isArray(list) ? list : []).filter((robot: any) =>
        !inactiveIds.has(String(robot?.robotId ?? robot?.robot_id ?? ''))).map((robot: any) => {
        const robotId = String(robot?.robotId ?? robot?.robot_id ?? '');
        return { ...robot, model: modelByRobotId.get(robotId) ?? robot?.model ?? '' };
      });
      applyRobotList(enriched);
    } catch {
      setBackendConnected(false);
    }
  }, [request, applyRobotList]);

  const selectRobot = useCallback((robotId: string) => {
    setSelectedRobotId((current) => robots.some((robot) => robot.robotId === robotId) ? robotId : current);
  }, [robots]);

  useEffect(() => {
    if (selectedRobotId) localStorage.setItem('nevo_selected_robot_id', selectedRobotId);
  }, [selectedRobotId]);

  useEffect(() => {
    // Reset authChecked tiap perubahan route: cek /auth/me untuk route BARU
    // harus selesai sebelum guard redirect (di bawah) boleh menendang ke /login.
    if (pathname === '/login' || pathname === '/offline') { setUser(null); setAuthUnavailable(false); setAuthChecked(true); setAuthFor(pathname); return; }
    setAuthChecked(false);
    setAuthUnavailable(false);
    let cancelled = false;
    fetch('/api/proxy/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) { setUser(await res.json()); setAuthUnavailable(false); }
        else { setUser(null); setAuthUnavailable(res.status !== 401 && res.status !== 403); }
      })
      .catch(() => { if (!cancelled) { setUser(null); setAuthUnavailable(true); } })
      .finally(() => { if (!cancelled) { setAuthChecked(true); setAuthFor(pathname); } });
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (authFor === pathname && authChecked && pathname !== '/login' && pathname !== '/offline' && !user && !authUnavailable && navigator.onLine) router.replace('/login');
  }, [authFor, authChecked, authUnavailable, pathname, user, router]);

  const logout = async () => {
    await fetch('/api/proxy/auth/logout', { method: 'POST', credentials: 'include', headers: csrfHeaders() });
    setUser(null);
    router.replace('/login');
  };

  // Poll robot REST state once on mount
  useEffect(() => {
    if (!user) return; // jangan poll di /login / sebelum auth — hindari 403 spam
    const refresh = () => {
      refreshRobots();
      request('integrations/simrs/status').then((status: any) => setSimrsStatus(status?.code || status?.lastSyncStatus || 'UNKNOWN')).catch(() => setSimrsStatus('BACKEND_OFFLINE'));
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [user, request, refreshRobots]);

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
        refreshRobots();
      };

      es.onmessage = (event) => {
        try {
          const env = JSON.parse(event.data);
          if (env.type === 'TELEMETRY' && env.data) {
            const robotId = String(env.data.robotId ?? env.data.robot_id ?? '');
            if (robotId) setRobots((current) => {
              const existing = current.find((robot) => robot.robotId === robotId);
              const next = normalizeRobot(env.data, existing ?? { ...defaultTelemetry, robotId });
              next.telemetryAvailable = existing?.telemetryAvailable === true || (env.data.battery != null && env.data.pose != null);
              return existing ? current.map((robot) => robot.robotId === robotId ? next : robot) : [...current, next];
            });
          } else if (env.type === 'ROBOT_COMMAND_RESULT' && env.data) {
            const robotId = env.data.robotId ?? env.data.robot_id;
            setLastCommandResult({ ...env.data, robotId });
          } else if (env.type === 'MISSION_EVENT' && env.data) {
            const robotId = env.data.robotId ?? env.data.robot_id;
            setMissionEvents((previous) => [{ ...env.data, robotId }, ...previous].slice(0, 120));
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
  }, [user, request, wsEnabled, refreshRobots]);

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

  if (pathname === '/login' || pathname === '/offline') return <>{children}</>;
  if (authFor === pathname && authChecked && authUnavailable) {
    return <main className="min-h-screen bg-page flex items-center justify-center p-6">
      <section role="alert" className="glass-panel max-w-md w-full p-6 text-center">
        <h1 className="text-xl font-semibold txt-main">Layanan belum tersedia</h1>
        <p className="mt-3 text-sm txt-sec">Koneksi ke backend belum tersedia. Periksa koneksi dan coba lagi.</p>
        <button type="button" className="btn-primary mt-5" onClick={() => window.location.reload()}>Coba lagi</button>
      </section>
    </main>;
  }
  if (!authChecked || !user) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-12 h-12 skeleton rounded-xl" />
      </div>
    );
  }

  const role = (user.role || '').toUpperCase() as Role;

  return (
    <AppContext.Provider
      value={{
        user,
        logout,
        telemetry,
        robots,
        selectedRobotId,
        selectRobot,
        selectedRobotConnected,
        selectedRobotHasTelemetry,
        backendConnected,
        simrsStatus,
        wsConnected,
        lastCommandResult,
        missionEvents: missionEvents.filter((event) => !event.robotId || event.robotId === selectedRobotId),
        request,
      }}
    >
      <div className="flex h-screen bg-page text-txt-main overflow-hidden font-sans">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 z-[100] btn-primary">Lewati ke konten</a>
        {isMobileMenuOpen && <button aria-label="Tutup menu" className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
        <aside className={`nevo-sidebar fixed md:relative z-50 h-full flex flex-col shrink-0 sidebar-transition text-white ${sidebarCollapsed ? 'is-collapsed w-64 md:w-20' : 'w-64'} ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <Link href="/dashboard" className="px-6 pt-9 pb-7" aria-label="NEVO Autonomous Hospital Robot — Dashboard"><NevoBrand compact={sidebarCollapsed && !isMobileMenuOpen} /></Link>
          <nav aria-label="Navigasi utama" className="flex-1 overflow-y-auto p-3 space-y-5">
            {NAV_SECTIONS.map(section => <div key={section.sectionKey} className={section.sectionKey === 'sectionSystem' ? 'border-t border-white/25 pt-5' : ''}>
              <div className="space-y-1.5">{section.items.filter(it => it.roles.includes(role)).map(it => <SidebarLink
                key={it.href} href={it.href} label={dict.sidebar[it.labelKey]} icon={it.icon} collapsed={sidebarCollapsed && !isMobileMenuOpen}
                active={pathname === it.href || (it.href === '/missions' && pathname.startsWith('/missions/') && pathname !== '/missions/create') || (it.href === '/settings' && ['/account', '/users', '/simrs', '/settings/'].some(p => pathname.startsWith(p)))}
                onClick={() => setIsMobileMenuOpen(false)}
              />)}</div>
            </div>)}
          </nav>
          <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? dict.sidebar.expand : dict.sidebar.collapse} aria-label={sidebarCollapsed ? dict.sidebar.expand : dict.sidebar.collapse} className="hidden md:flex items-center gap-3 px-3 py-3 mx-3 mb-3 rounded-xl text-white/80 hover:bg-white/10">
            {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            {!sidebarCollapsed && <span className="text-xs">{dict.sidebar.collapse}</span>}
          </button>
        </aside>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 px-4 md:px-8 flex items-center justify-between shrink-0 bg-page border-b border-border-base/60 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <button type="button" onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 min-w-11 min-h-11 rounded-lg" aria-label={dict.header.menu} aria-expanded={isMobileMenuOpen}><Menu size={20} /></button>
              {telemetry.simulated && <span className="status-pill status-warning">{dict.common.simulated}</span>}
              <span className="hidden sm:block text-xs txt-sec">Hospital Robotics Operations</span>
            </div>
            <div className="flex items-center gap-3"><LanguageSwitcher /><UserDropdown username={user.username} role={user.role} onLogoutClick={logout} /></div>
          </header>
          <main id="main-content" className="nevo-main flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
