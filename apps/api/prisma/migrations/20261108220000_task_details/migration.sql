ALTER TABLE "Task" ADD COLUMN "checklist" JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE "TaskComment" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" VARCHAR(5000) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId","createdAt");
