import './globals.css';
import AppShell from './components/AppShell';
import PwaStatus from './components/PwaStatus';

export const metadata = {
  title: 'NEVO — Autonomous Hospital Robot Web Monitoring',
  description: 'Web Monitoring, Autonomous Control & Map Management untuk Robot Pengantar Obat Rumah Sakit NEVO',
  manifest: '/manifest.webmanifest',
};

export const viewport = { themeColor: '#FFFFFF', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-slate-900 text-slate-100 antialiased">
        <AppShell>{children}</AppShell>
        <PwaStatus />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js', { scope: '/' }); }); }` }} />
      </body>
    </html>
  );
}
