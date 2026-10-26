'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { simrsMode, SIMRS_TONE_DOT } from '../lib/simrs-mode';
import { WS_URL } from '../lib/ws-config';
import {
  Settings, Shield, Server, Database, Bot, KeyRound, Building2, Cpu, HardDrive,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, request } = useApp();
  const { dict } = useLanguage();
  const t = dict.settings;
  const ts = dict.simrs;

  const [simrs, setSimrs] = useState<any>(null);
  const role = (user?.role || '').toUpperCase();

  useEffect(() => {
    request('integrations/simrs/status')
      .then(setSimrs)
      .catch(() => setSimrs({ mode: 'OFFLINE' }));
  }, [request]);

  const tone = simrsMode(simrs?.mode).tone;
  const modeLabel = ts.modes[(simrs?.mode || 'default') as keyof typeof ts.modes] ?? ts.modes.default;

  const roleCard = (key: 'OPERATOR' | 'FARMASI' | 'ADMIN', name: string, desc: string) => (
    <div
      className={`p-4 rounded-xl border text-xs transition-colors ${
        role === key
          ? 'bg-accent-muted border-accent txt-main'
          : 'bg-elevated/60 border-base txt-sec'
      }`}
    >
      <strong className="text-sm block txt-main">
        {name} {role === key && <span className="text-accent">{t.activeRole}</span>}
      </strong>
      <p className="mt-1 leading-relaxed">{desc}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6">
        <h2 className="text-xl font-bold txt-main flex items-center gap-2">
          <Settings className="text-accent" size={24} />
          {t.title}
        </h2>
        <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
      </div>

      {/* Integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel p-5 space-y-2">
          <span className="text-xs txt-sec font-medium flex items-center gap-1.5">
            <Server size={13} /> {t.backendApi}
          </span>
          <p className="text-sm font-mono txt-main truncate">/api/proxy/*</p>
          <p className="text-[11px] txt-sec">{t.port}: 8080 · BFF Next.js → Spring Boot</p>
        </div>

        <div className="glass-panel p-5 space-y-2">
          <span className="text-xs txt-sec font-medium flex items-center gap-1.5">
            <Cpu size={13} /> {t.webSocket}
          </span>
          <p className="text-sm font-mono txt-main truncate">{WS_URL}</p>
          <p className="text-[11px] txt-sec">TELEMETRY · MISSION_EVENT</p>
        </div>

        <div className="glass-panel p-5 space-y-2">
          <span className="text-xs txt-sec font-medium flex items-center gap-1.5">
            <Building2 size={13} /> {t.simrsIntegration}
          </span>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${SIMRS_TONE_DOT[tone]}`} />
            <strong className="text-sm txt-main">{modeLabel}</strong>
          </div>
          <p className="text-[11px] txt-sec font-mono">[{simrs?.mode || ts.modes.default}]</p>
        </div>

        <div className="glass-panel p-5 space-y-2">
          <span className="text-xs txt-sec font-medium flex items-center gap-1.5">
            <Bot size={13} /> {t.robotService}
          </span>
          <div className="flex items-center gap-2">
            <span className="status-pill status-warning">{dict.common.robotModeSim}</span>
          </div>
          <p className="text-[11px] txt-sec">{t.robotSimNote}</p>
        </div>
      </div>

      {/* RBAC */}
      <div className="glass-panel p-6 space-y-4">
        <h3 className="font-bold text-sm txt-main flex items-center gap-2 pb-3 border-b border-base">
          <Shield className="text-accent" size={16} />
          {t.rbac}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {roleCard('OPERATOR', t.roleOperator, t.roleOperatorDesc)}
          {roleCard('FARMASI', t.roleFarmasi, t.roleFarmasiDesc)}
          {roleCard('ADMIN', t.roleAdmin, t.roleAdminDesc)}
        </div>
      </div>

      {/* Architecture */}
      <div className="glass-panel p-6 space-y-4">
        <h3 className="font-bold text-sm txt-main flex items-center gap-2 pb-3 border-b border-base">
          <Database className="text-accent" size={16} />
          {t.architecture}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-elevated/60 border border-base space-y-1">
            <span className="txt-sec flex items-center gap-1.5"><Server size={12} /> {t.backendApi}</span>
            <strong className="text-sm txt-main block">{t.backendVersion}</strong>
          </div>
          <div className="p-4 rounded-xl bg-elevated/60 border border-base space-y-1">
            <span className="txt-sec flex items-center gap-1.5"><Database size={12} /> {t.db}</span>
            <strong className="text-sm txt-main block">{t.dbVersion}</strong>
            <p className="txt-sec text-[11px]">{t.dbMigrations}</p>
          </div>
          <div className="p-4 rounded-xl bg-elevated/60 border border-base space-y-1">
            <span className="txt-sec flex items-center gap-1.5"><HardDrive size={12} /> {t.storage}</span>
            <strong className="text-sm txt-main block">{t.storagePath}</strong>
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-accent/30 bg-accent-muted/50">
            <h4 className="text-xs font-bold txt-main flex items-center gap-1.5">
              <KeyRound size={13} className="text-accent" /> {t.simrsReadonly}
            </h4>
            <p className="text-[11px] txt-sec mt-1 leading-relaxed">{t.simrsEnvNote}</p>
          </div>

          <div className="p-4 rounded-xl border border-warning/30 bg-warning/5">
            <h4 className="text-xs font-bold txt-main flex items-center gap-1.5">
              <Bot size={13} className="text-warning" /> {t.robotSimTitle}
            </h4>
            <p className="text-[11px] txt-sec mt-1 leading-relaxed">{t.robotSimDesc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
