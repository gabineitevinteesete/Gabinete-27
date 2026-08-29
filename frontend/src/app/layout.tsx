import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gabinete Digital',
  description: 'Gestão de demandas do gabinete parlamentar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
