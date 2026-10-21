'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bot, Database, History, LayoutDashboard, Map as MapIcon, Navigation, Settings, ShieldCheck, Wifi, WifiOff } from 'lucide-react';

interface SidebarProps {
  wsConnected: boolean;
  robotStatus: string;
  backendConnected: boolean;
  simrsStatus: string;
}

export default function Sidebar({ wsConnected, robotStatus, backendConnected, simrsStatus }: SidebarProps) {
  const pathname = usePathname();
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/control', label: 'Kendali Navigasi', icon: Navigation },
    { href: '/monitoring', label: 'Monitoring Live', icon: Activity },
    { href: '/missions', label: 'Riwayat Misi', icon: History },
    { href: '/simrs', label: 'Integrasi SIMRS', icon: Database },
    { href: '/mapping', label: 'Peta & Waypoint', icon: MapIcon },
    { href: '/settings', label: 'Pengaturan', icon: Settings },
  ];

  return (
    <aside className="nevo-sidebar w-64 shrink-0 bg-white border-r border-neutral-200 flex flex-col justify-between select-none">
      <div>
        <div className="px-5 py-6 border-b border-neutral-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white shadow-sm"><Bot size={21} /></div>
          <div className="sidebar-copy min-w-0">
            <h1 className="font-bold text-sm text-neutral-900 tracking-tight flex items-center gap-2">NEVO <span className="text-[10px] text-neutral-700 bg-neutral-100 border border-neutral-300 px-1.5 py-0.5 rounded-md font-mono">v1.0</span></h1>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">Hospital robotics operations</p>
          </div>
        </div>

        <nav className="p-3 space-y-1.5">
          <p className="sidebar-label px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-neutral-400">Workspace</p>
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return <Link key={href} href={href} id={`nav-link-${href.replace('/', '')}`} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-neutral-200 text-neutral-900 font-semibold' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}`}>
              <Icon size={17} strokeWidth={isActive ? 2.3 : 1.9} /><span className="sidebar-label">{label}</span>
            </Link>;
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-neutral-200 space-y-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between"><span className="text-neutral-500 flex items-center gap-1.5"><Wifi size={13} /> WebSocket</span><span className={wsConnected ? 'status-pill status-success' : 'status-pill status-warning'}>{wsConnected ? 'LIVE' : 'OFFLINE'}</span></div>
          <div className="flex items-center justify-between"><span className="text-neutral-500">Backend API</span><span className={backendConnected ? 'status-pill status-success' : 'status-pill status-danger'}>{backendConnected ? 'ONLINE' : 'OFFLINE'}</span></div>
          <div className="flex items-center justify-between"><span className="text-neutral-500">SIMRS HTTP</span><span className={simrsStatus === 'CONNECTED' ? 'status-pill status-success' : 'status-pill status-warning'}>{simrsStatus}</span></div>
          <div className="flex items-center justify-between pt-2 border-t border-neutral-200"><span className="text-neutral-500">Robot</span><span className="font-mono text-[10px] font-semibold text-neutral-700">{robotStatus}</span></div>
        </div>
        <div className="rounded-lg bg-neutral-900 text-white p-3 text-[10px] leading-relaxed flex gap-2"><ShieldCheck size={14} className="shrink-0 text-neutral-300 mt-0.5" /><span>Mode simulasi aktif. Perintah robot fisik tetap dilindungi.</span></div>
      </div>
    </aside>
  );
}
