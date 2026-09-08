-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "criadoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
