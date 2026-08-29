import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient();

export async function resetDb() {
  await testPrisma.auditLog.deleteMany();
  await testPrisma.loginAttempt.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  await testPrisma.user.deleteMany();
}
