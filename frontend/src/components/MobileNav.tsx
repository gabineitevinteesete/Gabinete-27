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
  { href: '/painel/assessores', label: 'Equipe', somenteChefe: true },
];

export function MobileNav({ role }: { role: UserRoleValue }) {
  const itensVisiveis = ITENS.filter((item) => !item.somenteChefe || role === 'CHEFE');

  return (
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-gray-200 bg-white py-2 md:hidden">
      {itensVisiveis.map((item) => (
        <a key={item.href} href={item.href} className="px-3 py-2 text-sm text-primary-dark">
          {item.label}
        </a>
      ))}
      <BotaoSair className="px-3 py-2 text-sm text-primary-dark disabled:opacity-60" />
    </nav>
  );
}
