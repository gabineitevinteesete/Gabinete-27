/* Service worker do Gabinete Digital.
 *
 * Regras (ver docs/superpowers/specs/2026-10-07-pwa-offline-etapa1-design.md):
 * - /_next/static/* e /icons/*: cache primeiro (arquivos com hash no nome, nunca ficam velhos).
 * - Navegação (páginas): rede primeiro; sem rede, devolve a última cópia guardada.
 * - Tudo o mais (API, outros domínios, métodos que não sejam GET) vai direto para a rede: este
 *   arquivo nunca guarda resposta da API.
 */
const VERSAO = 'gd-v1';
const CACHE_ESTATICO = `${VERSAO}-estatico`;
const CACHE_PAGINAS = `${VERSAO}-paginas`;

// Páginas do fluxo offline. São o "casco" do app (HTML igual para todos; os dados vêm da API).
const ROTAS_PRECARREGADAS = ['/painel', '/painel/demandas/nova', '/painel/demandas/pendentes'];

async function precarregar() {
  const paginas = await caches.open(CACHE_PAGINAS);
  const estaticos = await caches.open(CACHE_ESTATICO);
  for (const rota of ROTAS_PRECARREGADAS) {
    try {
      const resposta = await fetch(rota, { credentials: 'same-origin' });
      if (!resposta.ok || resposta.redirected) continue;
      await paginas.put(rota, resposta.clone());
      // Os scripts e estilos que a página usa, para ela abrir mesmo sem rede.
      const html = await resposta.text();
      const arquivos = new Set(html.match(/\/_next\/static\/[^"'\\\s<>)]+/g) || []);
      await Promise.all([...arquivos].map((arquivo) => estaticos.add(arquivo).catch(() => {})));
    } catch (erro) {
      // Sem rede na instalação: as páginas entram no cache conforme forem visitadas.
    }
  }
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(precarregar().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((nome) => !nome.startsWith(VERSAO)).map((nome) => caches.delete(nome)));
      await self.clients.claim();
    })(),
  );
});

async function cachePrimeiro(requisicao) {
  const cache = await caches.open(CACHE_ESTATICO);
  const guardada = await cache.match(requisicao);
  if (guardada) return guardada;
  const resposta = await fetch(requisicao);
  if (resposta.ok) cache.put(requisicao, resposta.clone());
  return resposta;
}

async function redePrimeiro(requisicao) {
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const resposta = await fetch(requisicao);
    // Só guarda página que respondeu direto (nada de redirecionamento para o login etc.).
    if (resposta.ok && !resposta.redirected) cache.put(requisicao, resposta.clone());
    return resposta;
  } catch (erro) {
    const guardada = (await cache.match(requisicao)) || (await cache.match('/painel'));
    if (guardada) return guardada;
    return new Response('Sem conexão.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    evento.respondWith(cachePrimeiro(requisicao));
    return;
  }

  if (requisicao.mode === 'navigate') {
    evento.respondWith(redePrimeiro(requisicao));
  }
});
