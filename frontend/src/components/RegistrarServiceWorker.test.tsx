import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { RegistrarServiceWorker } from './RegistrarServiceWorker';

const register = vi.fn();

beforeEach(() => {
  register.mockReset().mockResolvedValue({});
  Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('RegistrarServiceWorker', () => {
  it('não registra fora de produção', () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<RegistrarServiceWorker />);

    expect(register).not.toHaveBeenCalled();
  });

  it('registra /sw.js em produção', () => {
    vi.stubEnv('NODE_ENV', 'production');

    render(<RegistrarServiceWorker />);

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('não quebra se o registro falhar', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    register.mockRejectedValue(new Error('bloqueado'));

    expect(() => render(<RegistrarServiceWorker />)).not.toThrow();
    await Promise.resolve();
  });
});
