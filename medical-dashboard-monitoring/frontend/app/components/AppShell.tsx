'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { Lock, RefreshCw, AlertTriangle, BatteryCharging, Battery, Radio } from 'lucide-react';

export interface RobotTelemetry {
  robotId: string;
  name: string;
  status: string; // IDLE, NAVIGATING, CHARGING, ERROR
  mode: string;
  battery: number;
  pose: { x: number; y: number; yaw: number };
  speed: number;
  activeMissionId: string | null;
  simulated: boolean;
  lastSeen: string;
}

interface AppContextType {
  user: { username: string; role: 'operator' | 'admin' } | null;
  logout: () => Promise<void>;
  authHeader: string;
  telemetry: RobotTelemetry;
  backendConnected: boolean;
  simrsStatus: string;
  wsConnected: boolean;
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
  simulated: true,
  lastSeen: new Date().toISOString(),
};

const AppContext = createContext<AppContextType>({
  user: null,
  logout: async () => {},
  authHeader: '',
  telemetry: defaultTelemetry,
  backendConnected: false,
  simrsStatus: 'UNKNOWN',
  wsConnected: false,
  request: async () => ({}),
});

export const useApp = () => useContext(AppContext);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppContextType['user']>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [telemetry, setTelemetry] = useState<RobotTelemetry>(defaultTelemetry);
  const [backendConnected, setBackendConnected] = useState(false);
  const [simrsStatus, setSimrsStatus] = useState('UNKNOWN');
  const [wsConnected, setWsConnected] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const authHeader = '';

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const res = await fetch(`/api/proxy/${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = typeof data === 'string' ? data : data.message || data.error || JSON.stringify(data);
      throw new Error(err);
    }
    return data;
  }, []);

  useEffect(() => {
    if (pathname === '/login') { setAuthChecked(true); return; }
    fetch('/api/proxy/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => res.ok ? setUser(await res.json()) : setUser(null))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, [pathname]);

  useEffect(() => {
    if (authChecked && pathname !== '/login' && !user) router.replace('/login');
  }, [authChecked, pathname, user, router]);

  const logout = async () => {
    await fetch('/api/proxy/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    router.replace('/login');
  };

  // Poll robot REST state once on mount
  useEffect(() => {
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

  // WebSocket real-time connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      const wsPort = process.env.NEXT_PUBLIC_BACKEND_WS_PORT || '8081';
      const wsUrl = `ws://${window.location.hostname}:${wsPort}/ws/robot`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        // Reconcile robot state after reconnect; no command queue is used.
        request('robots').then((list: any[]) => {
          setBackendConnected(true);
          if (list?.[0]) setTelemetry(list[0]);
        }).catch(() => { setBackendConnected(false); setWsConnected(false); });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TELEMETRY' && msg.data) {
            setTelemetry(msg.data);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setWsConnected(false);
        ws?.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  if (pathname === '/login') return <>{children}</>;
  if (!authChecked || !user) return <div className="min-h-screen bg-slate-900" />;

  return (
    <AppContext.Provider
      value={{
        user,
        logout,
        authHeader,
        telemetry,
        backendConnected,
        simrsStatus,
        wsConnected,
        request,
      }}
    >
      <div className="flex h-screen bg-neutral-50 text-neutral-900 overflow-hidden font-sans">
        <Sidebar wsConnected={wsConnected} robotStatus={telemetry.status} backendConnected={backendConnected} simrsStatus={simrsStatus} />

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Top Header */}
          <header className="h-16 bg-white border-b border-neutral-200 px-5 md:px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                <AlertTriangle size={13} /> Mode Simulasi Web · Perangkat Fisik Belum Tersambung
              </span>
            </div>

            {/* Right Header Statuses */}
            <div className="flex items-center gap-4">
              {/* Telemetry quick view */}
              <div className="hidden md:flex items-center gap-3 text-xs text-slate-300 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
                <span className="flex items-center gap-1">
                  <Radio size={14} className={telemetry.status === 'NAVIGATING' ? 'text-sky-400 animate-pulse' : 'text-slate-400'} />
                  <strong className="font-mono text-sky-300">{telemetry.status}</strong>
                </span>
                <span className="text-slate-600">|</span>
                <span className="flex items-center gap-1">
                  {telemetry.battery > 20 ? (
                    <Battery size={15} className="text-emerald-400" />
                  ) : (
                    <BatteryCharging size={15} className="text-rose-400" />
                  )}
                  <strong className="font-mono">{telemetry.battery.toFixed(1)}%</strong>
                </span>
                <span className="text-slate-600">|</span>
                <span className="font-mono text-[11px] text-slate-400">
                  ({telemetry.pose.x.toFixed(2)}m, {telemetry.pose.y.toFixed(2)}m)
                </span>
              </div>

              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1">
                <Lock size={13} className="text-slate-400" />
                <span className="text-xs text-slate-300">{user.username} · {user.role === 'admin' ? 'Administrator' : 'Operator'}</span>
                <button onClick={logout} className="text-xs text-rose-300 hover:text-rose-200 ml-2">Logout</button>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 bg-neutral-50 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
