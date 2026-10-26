import './globals.css';
import AppShell from './components/AppShell';
import PwaStatus from './components/PwaStatus';
import { LanguageProvider } from './components/LanguageProvider';

export const metadata = {
  title: 'NEVO — Autonomous Hospital Robot Web Monitoring',
  description: 'Web Monitoring, Autonomous Control & Map Management untuk Robot Pengantar Obat Rumah Sakit NEVO',
  manifest: '/manifest.webmanifest',
};

export const viewport = { themeColor: '#FFFFFF', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-page text-txt-main antialiased">
        <LanguageProvider>
          <AppShell>{children}</AppShell>
        </LanguageProvider>
        <PwaStatus />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js', { scope: '/' }); }); }` }} />
      </body>
    </html>
  );
}
