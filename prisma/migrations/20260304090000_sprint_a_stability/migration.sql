-- Sprint A migration:
-- 1) Add status/error/schema metadata fields for replay on failure.
-- 2) Add StepAttempt audit table for parse/debug/repair/db_tx attempts.

-- AlterTable
ALTER TABLE "Session"
ADD COLUMN "lastStatus" TEXT;

-- AlterTable
ALTER TABLE "Message"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'success',
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "schemaVersion" TEXT,
ADD COLUMN "metadata" JSONB;

-- AlterTable
ALTER TABLE "DebugResult"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'success',
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "schemaVersion" TEXT,
ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "StepAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestId" TEXT NOT NULL,
    "durationMs" INTEGER,
    "payloadIn" JSONB,
    "payloadOut" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StepAttempt_sessionId_roundIndex_stepType_attempt_idx"
ON "StepAttempt"("sessionId", "roundIndex", "stepType", "attempt");

-- AddForeignKey
ALTER TABLE "StepAttempt"
ADD CONSTRAINT "StepAttempt_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
