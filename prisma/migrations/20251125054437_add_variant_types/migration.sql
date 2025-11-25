/*
  Warnings:

  - You are about to drop the column `created_at` on the `variant_options` table. All the data in the column will be lost.
  - You are about to drop the column `variant_type_id` on the `variant_options` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `variant_types` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `variant_types` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `variant_types` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[variantTypeId,value]` on the table `variant_options` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[productId,name]` on the table `variant_types` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `variantTypeId` to the `variant_options` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `variant_types` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `variant_types` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "variant_options" DROP CONSTRAINT "variant_options_variant_type_id_fkey";

-- DropForeignKey
ALTER TABLE "variant_types" DROP CONSTRAINT "variant_types_product_id_fkey";

-- DropIndex
DROP INDEX "variant_options_variant_type_id_value_key";

-- DropIndex
DROP INDEX "variant_types_product_id_name_key";

-- AlterTable
ALTER TABLE "variant_options" DROP COLUMN "created_at",
DROP COLUMN "variant_type_id",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "variantTypeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "variant_types" DROP COLUMN "created_at",
DROP COLUMN "product_id",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "variant_options_variantTypeId_value_key" ON "variant_options"("variantTypeId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "variant_types_productId_name_key" ON "variant_types"("productId", "name");

-- AddForeignKey
ALTER TABLE "variant_types" ADD CONSTRAINT "variant_types_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_options" ADD CONSTRAINT "variant_options_variantTypeId_fkey" FOREIGN KEY ("variantTypeId") REFERENCES "variant_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
