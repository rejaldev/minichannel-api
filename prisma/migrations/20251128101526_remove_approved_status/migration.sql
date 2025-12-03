/*
  Warnings:

  - The values [APPROVED] on the enum `ReturnStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ReturnStatus_new" AS ENUM ('PENDING', 'REJECTED', 'COMPLETED');
ALTER TABLE "public"."returns" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "returns" ALTER COLUMN "status" TYPE "ReturnStatus_new" USING ("status"::text::"ReturnStatus_new");
ALTER TYPE "ReturnStatus" RENAME TO "ReturnStatus_old";
ALTER TYPE "ReturnStatus_new" RENAME TO "ReturnStatus";
DROP TYPE "public"."ReturnStatus_old";
ALTER TABLE "returns" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
