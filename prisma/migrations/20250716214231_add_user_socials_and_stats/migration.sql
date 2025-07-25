-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company" TEXT,
ADD COLUMN     "followersCount" INTEGER,
ADD COLUMN     "followingCount" INTEGER,
ADD COLUMN     "githubCreatedAt" TIMESTAMP(3),
ADD COLUMN     "publicRepos" INTEGER,
ADD COLUMN     "twitterUsername" TEXT;
