/*
  Warnings:

  - Made the column `criadoPorId` on table `requests` required. This step will fail if there are existing NULL values in that column.

*/
-- Preenche criadoPorId de qualquer linha que ainda não tenha (idempotente — não
-- afeta bancos onde o backfill já rodou, nem bancos sem nenhuma linha em requests).
UPDATE "requests" r
SET "criadoPorId" = COALESCE(
  (SELECT h."assessorAnteriorId" FROM "request_reassignment_history" h
   WHERE h."requestId" = r."id" ORDER BY h."createdAt" ASC LIMIT 1),
  r."assessorResponsavelId"
)
WHERE r."criadoPorId" IS NULL;

-- DropForeignKey
ALTER TABLE "requests" DROP CONSTRAINT "requests_criadoPorId_fkey";

-- AlterTable
ALTER TABLE "requests" ALTER COLUMN "criadoPorId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
