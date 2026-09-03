-- CreateTable
CREATE TABLE "request_reassignment_history" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "assessorAnteriorId" TEXT NOT NULL,
    "assessorNovoId" TEXT NOT NULL,
    "reatribuidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_reassignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_reassignment_history_requestId_idx" ON "request_reassignment_history"("requestId");

-- AddForeignKey
ALTER TABLE "request_reassignment_history" ADD CONSTRAINT "request_reassignment_history_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_reassignment_history" ADD CONSTRAINT "request_reassignment_history_assessorAnteriorId_fkey" FOREIGN KEY ("assessorAnteriorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_reassignment_history" ADD CONSTRAINT "request_reassignment_history_assessorNovoId_fkey" FOREIGN KEY ("assessorNovoId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_reassignment_history" ADD CONSTRAINT "request_reassignment_history_reatribuidoPorId_fkey" FOREIGN KEY ("reatribuidoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
