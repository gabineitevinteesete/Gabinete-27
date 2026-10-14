-- AlterTable
ALTER TABLE "requests" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "requests_criadoPorId_idempotencyKey_key" ON "requests"("criadoPorId", "idempotencyKey");
