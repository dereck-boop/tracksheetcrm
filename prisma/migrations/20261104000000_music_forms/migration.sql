-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "address" TEXT,
ADD COLUMN     "ipi" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "pro" TEXT,
ADD COLUMN     "publisher" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "cLine" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "pLine" TEXT,
ADD COLUMN     "releaseDate" TIMESTAMP(3),
ADD COLUMN     "upc" TEXT;

-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "sessionReleaseText" TEXT;

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "explicit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featuring" TEXT,
ADD COLUMN     "isrc" TEXT;

-- CreateTable
CREATE TABLE "TrackCredit" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrackCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackSplit" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'Writer',
    "percent" DECIMAL(5,2) NOT NULL,
    "pro" TEXT,
    "ipi" TEXT,
    "publisher" TEXT,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedName" TEXT,
    "signedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionHire" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contactId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "workDate" TIMESTAMP(3),
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedName" TEXT,
    "signedIp" TEXT,
    "signedText" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidMethod" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionHire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackCredit_trackId_idx" ON "TrackCredit"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackSplit_token_key" ON "TrackSplit"("token");

-- CreateIndex
CREATE INDEX "TrackSplit_trackId_idx" ON "TrackSplit"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionHire_token_key" ON "SessionHire"("token");

-- CreateIndex
CREATE INDEX "SessionHire_studioId_paidAt_idx" ON "SessionHire"("studioId", "paidAt");

-- CreateIndex
CREATE INDEX "SessionHire_projectId_idx" ON "SessionHire"("projectId");

-- CreateIndex
CREATE INDEX "SessionHire_contactId_idx" ON "SessionHire"("contactId");

-- AddForeignKey
ALTER TABLE "TrackCredit" ADD CONSTRAINT "TrackCredit_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackSplit" ADD CONSTRAINT "TrackSplit_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionHire" ADD CONSTRAINT "SessionHire_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionHire" ADD CONSTRAINT "SessionHire_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionHire" ADD CONSTRAINT "SessionHire_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

