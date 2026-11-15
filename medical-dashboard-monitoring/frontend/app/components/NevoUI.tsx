import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ClipboardList } from 'lucide-react';

export function NevoBrand({ compact = false }: { compact?: boolean }) {
  return <div className="nevo-brand">
    <svg viewBox="0 0 48 64" fill="currentColor" aria-hidden="true">
      <path d="M3 3Q12 0 23 4V15Q13 11 3 13ZM25 4Q36 0 45 3V13Q35 11 25 15Z" />
      <path d="M3 22Q3 19 7 19H12V42Q12 52 24 52T36 42V19H41Q45 19 45 22V43Q45 63 24 63T3 43Z" />
    </svg>
    {!compact && <div><strong>NEVO</strong><span>Autonomous<br />Hospital Robot</span></div>}
  </div>;
}

export function RobotArtwork({ variant = 'hero', className = '' }: { variant?: 'hero' | 'fullbody' | 'head' | 'rear'; className?: string }) {
  return <img src={`/images/nevo/nevo-${variant}.webp`} alt="Robot NEVO dengan monitor wajah, headset merah, dan panel putih abu-abu" className={`nevo-artwork ${className}`} draggable={false} />;
}

export function PageHeading({ title, description, actions, robot = false, actionsPlacement = 'side' }: { title: string; description?: string; actions?: ReactNode; robot?: boolean; actionsPlacement?: 'side' | 'below' }) {
  return <header className={`page-heading ${robot ? 'page-heading-robot' : ''}`}>
    <div className="page-heading-copy"><h1>{title}</h1>{description && <p>{description}</p>}{actions && actionsPlacement === 'below' && <div className="page-heading-actions page-heading-actions-below">{actions}</div>}</div>
    {actions && actionsPlacement === 'side' && <div className="page-heading-actions">{actions}</div>}
    {robot && <RobotArtwork className="page-heading-art" />}
  </header>;
}

export function EmptyState({ title, description, action, icon: Icon = ClipboardList }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={48} strokeWidth={1.4} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function StatCard({ label, value, icon: Icon, children, tone = 'brand' }: { label: string; value: ReactNode; icon: LucideIcon; children?: ReactNode; tone?: 'brand' | 'success' | 'warning' }) {
  return <div className={`glass-panel stat-card stat-${tone}`}><div className="stat-main"><span className="stat-icon"><Icon size={28} strokeWidth={1.8} /></span><div><p>{label}</p><strong>{value}</strong></div></div>{children && <div className="stat-foot">{children}</div>}</div>;
}
