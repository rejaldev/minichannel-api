/*
  Warnings:

  - You are about to drop the column `barcode` on the `product_variants` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "product_variants_barcode_key";

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "barcode";
