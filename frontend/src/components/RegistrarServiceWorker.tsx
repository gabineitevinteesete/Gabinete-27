'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker (`/sw.js`) só em produção: em desenvolvimento ele guardaria
 * versões antigas das páginas e atrapalharia o hot reload.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem service worker o app funciona normalmente, só não abre sem internet.
    });
  }, []);

  return null;
}
