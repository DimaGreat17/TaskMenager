ALTER TABLE "Board" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BoardNode" ADD COLUMN "groupId" UUID;
CREATE INDEX "BoardNode_boardId_groupId_idx" ON "BoardNode" ("boardId","groupId");
