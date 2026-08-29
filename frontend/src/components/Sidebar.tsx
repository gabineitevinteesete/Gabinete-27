'use client';

import type { UserRoleValue } from '@/hooks/use-auth';
import { BotaoSair } from '@/components/BotaoSair';

interface ItemMenu {
  href: string;
  label: string;
  somenteChefe?: boolean;
}

const ITENS: ItemMenu[] = [
  { href: '/painel', label: 'Painel' },
  { href: '/painel/demandas', label: 'Demandas' },
  { href: '/painel/assessores', label: 'Assessores', somenteChefe: true },
  { href: '/painel/configuracoes', label: 'Configurações', somenteChefe: true },
];

export function Sidebar({ role }: { role: UserRoleValue }) {
  const itensVisiveis = ITENS.filter((item) => !item.somenteChefe || role === 'CHEFE');

  return (
    <aside className="hidden w-56 flex-col bg-primary-dark p-4 text-white md:flex">
      <p className="mb-6 px-2 text-base font-semibold">Gabinete digital</p>
      <nav className="flex flex-col gap-1">
        {itensVisiveis.map((item) => (
          <a key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            {item.label}
          </a>
        ))}
      </nav>
      <BotaoSair className="mt-auto rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-60" />
    </aside>
  );
}
