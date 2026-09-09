import { describe, it, expect } from 'vitest';
import { ROLE_LABEL, ROLE_OPTIONS } from './user-role';

describe('ROLE_LABEL', () => {
  it('tem um rótulo em português pra cada papel', () => {
    expect(ROLE_LABEL.ASSESSOR_RUA).toBe('Assessor de rua');
    expect(ROLE_LABEL.CHEFE).toBe('Chefe');
    expect(ROLE_LABEL.ASSESSOR_GABINETE).toBe('Assessor de gabinete');
  });

  it('ROLE_OPTIONS lista os mesmos três papéis', () => {
    expect(ROLE_OPTIONS).toEqual(['ASSESSOR_RUA', 'CHEFE', 'ASSESSOR_GABINETE']);
  });
});
