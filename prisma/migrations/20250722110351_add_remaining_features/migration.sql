-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REPLY';

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "user_preferences" ALTER COLUMN "privacy" SET DEFAULT '{"showEmail": false, "showLocation": true, "profileVisibility": "public"}';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gender" TEXT;

-- CreateTable
CREATE TABLE "bug_views" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bug_views_bugId_userId_key" ON "bug_views"("bugId", "userId");

-- AddForeignKey
ALTER TABLE "bug_views" ADD CONSTRAINT "bug_views_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_views" ADD CONSTRAINT "bug_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
