-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SINGLE', 'VARIANT');

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "price" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "price" DOUBLE PRECISION,
ADD COLUMN     "productType" "ProductType" NOT NULL DEFAULT 'VARIANT';
