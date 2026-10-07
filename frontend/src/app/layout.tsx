import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { RegistrarServiceWorker } from '@/components/RegistrarServiceWorker';

export const metadata: Metadata = {
  title: 'Gabinete Digital',
  description: 'Gestão de demandas do gabinete parlamentar',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Gabinete', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#163A82',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <RegistrarServiceWorker />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
