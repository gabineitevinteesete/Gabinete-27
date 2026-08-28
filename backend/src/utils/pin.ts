import { hash, verify } from '@node-rs/argon2';

export function isPinFormatValid(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

const SEQUENCIAS_OBVIAS = (() => {
  const set = new Set<string>();
  for (let d = 0; d <= 9; d++) {
    set.add(String(d).repeat(6));
  }
  for (let start = 0; start <= 4; start++) {
    let crescente = '';
    let decrescente = '';
    for (let i = 0; i < 6; i++) {
      crescente += String(start + i);
      decrescente += String(9 - start - i);
    }
    set.add(crescente);
    set.add(decrescente);
  }
  return set;
})();

export function isPinObvious(pin: string): boolean {
  return SEQUENCIAS_OBVIAS.has(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return verify(pinHash, pin);
}
