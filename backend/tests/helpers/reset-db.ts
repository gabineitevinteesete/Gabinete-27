import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://gabinete:gabinete@localhost:5433/gabinete_test' } },
});

export async function resetDb() {
  await testPrisma.auditLog.deleteMany();
  await testPrisma.loginAttempt.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  await testPrisma.user.deleteMany();
}
