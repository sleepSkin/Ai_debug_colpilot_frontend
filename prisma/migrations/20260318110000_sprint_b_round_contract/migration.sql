-- Sprint B contract hardening:
-- 1) Promote round-level linkage fields from metadata to explicit columns.
-- 2) Add list-page summary fields on Session for stable, cheap reads.

-- AlterTable
ALTER TABLE "Session"
ADD COLUMN "lastRoundIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastErrorMessage" TEXT;

-- AlterTable
ALTER TABLE "Message"
ADD COLUMN "roundIndex" INTEGER;

-- AlterTable
ALTER TABLE "DebugResult"
ADD COLUMN "sessionId" TEXT,
ADD COLUMN "roundIndex" INTEGER;

-- CreateIndex
CREATE INDEX "Message_sessionId_roundIndex_role_idx"
ON "Message"("sessionId", "roundIndex", "role");

-- CreateIndex
CREATE INDEX "DebugResult_sessionId_roundIndex_idx"
ON "DebugResult"("sessionId", "roundIndex");
