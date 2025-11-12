-- AlterTable
ALTER TABLE "transaction_items" ADD COLUMN     "sku" TEXT;

-- CreateTable
CREATE TABLE "price_discrepancies" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "expectedPrice" DOUBLE PRECISION NOT NULL,
    "actualPrice" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_discrepancies_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_discrepancies" ADD CONSTRAINT "price_discrepancies_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_discrepancies" ADD CONSTRAINT "price_discrepancies_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
