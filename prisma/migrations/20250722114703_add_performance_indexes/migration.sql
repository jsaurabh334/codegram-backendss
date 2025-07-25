-- CreateIndex
CREATE INDEX "bugs_authorId_idx" ON "bugs"("authorId");

-- CreateIndex
CREATE INDEX "bugs_expiresAt_idx" ON "bugs"("expiresAt");

-- CreateIndex
CREATE INDEX "comments_authorId_idx" ON "comments"("authorId");

-- CreateIndex
CREATE INDEX "comments_snippetId_idx" ON "comments"("snippetId");

-- CreateIndex
CREATE INDEX "comments_docId_idx" ON "comments"("docId");

-- CreateIndex
CREATE INDEX "comments_bugId_idx" ON "comments"("bugId");

-- CreateIndex
CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");

-- CreateIndex
CREATE INDEX "docs_authorId_idx" ON "docs"("authorId");

-- CreateIndex
CREATE INDEX "follows_followerId_idx" ON "follows"("followerId");

-- CreateIndex
CREATE INDEX "follows_followingId_idx" ON "follows"("followingId");

-- CreateIndex
CREATE INDEX "notifications_recipientId_idx" ON "notifications"("recipientId");

-- CreateIndex
CREATE INDEX "snippets_authorId_idx" ON "snippets"("authorId");

-- CreateIndex
CREATE INDEX "snippets_language_idx" ON "snippets"("language");
