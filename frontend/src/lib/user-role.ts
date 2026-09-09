import type { UserRoleValue } from '@/types/auth';

export const ROLE_LABEL: Record<UserRoleValue, string> = {
  ASSESSOR_RUA: 'Assessor de rua',
  CHEFE: 'Chefe',
  ASSESSOR_GABINETE: 'Assessor de gabinete',
};

export const ROLE_OPTIONS: UserRoleValue[] = ['ASSESSOR_RUA', 'CHEFE', 'ASSESSOR_GABINETE'];
