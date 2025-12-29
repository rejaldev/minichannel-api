-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "weight" INTEGER;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "length" INTEGER;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
