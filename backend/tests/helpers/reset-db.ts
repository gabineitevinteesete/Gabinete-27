import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient();

export async function resetDb() {
  await testPrisma.auditLog.deleteMany();
  await testPrisma.loginAttempt.deleteMany();
  // requestPhoto/request/requestType precisam ser limpos antes de refreshToken/user por
  // causa das FKs RESTRICT em requests (assessorResponsavelId, requestTypeId) — desde que
  // o repositório de demandas passou a popular essas tabelas nos testes de integração.
  // requestStatusHistory/requestReassignmentHistory/internalNote também referenciam request
  // com FK RESTRICT — precisam ser limpas antes de request.
  await testPrisma.requestPhoto.deleteMany();
  await testPrisma.requestStatusHistory.deleteMany();
  await testPrisma.requestReassignmentHistory.deleteMany();
  await testPrisma.internalNote.deleteMany();
  await testPrisma.request.deleteMany();
  await testPrisma.requestType.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  await testPrisma.user.deleteMany();
}
