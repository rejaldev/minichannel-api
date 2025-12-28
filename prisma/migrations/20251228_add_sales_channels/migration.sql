-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('POS', 'MARKETPLACE', 'WEBSITE', 'SOCIAL', 'OTHER');

-- CreateEnum  
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'ONPROCESS', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sales_channels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL DEFAULT 'MARKETPLACE',
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "apiConfig" JSONB,
    "fieldMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_stocks" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "allocatedQty" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "soldQty" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_channels_code_key" ON "sales_channels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "channel_stocks_channelId_productVariantId_key" ON "channel_stocks"("channelId", "productVariantId");

-- AddForeignKey
ALTER TABLE "channel_stocks" ADD CONSTRAINT "channel_stocks_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_stocks" ADD CONSTRAINT "channel_stocks_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert default POS channel
INSERT INTO "sales_channels" ("id", "code", "name", "type", "icon", "color", "isActive", "isBuiltIn", "createdAt", "updatedAt")
VALUES ('pos-default', 'POS', 'Point of Sale', 'POS', 'store', '#3B82F6', true, true, NOW(), NOW());

-- AlterTable: Add channel fields to transactions
ALTER TABLE "transactions" ADD COLUMN "channelId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "transactions" ADD COLUMN "externalOrderId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "externalInvoice" TEXT;
ALTER TABLE "transactions" ADD COLUMN "externalStatus" TEXT;
ALTER TABLE "transactions" ADD COLUMN "externalData" JSONB;
ALTER TABLE "transactions" ADD COLUMN "shippingCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "platformFee" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "buyerUsername" TEXT;

-- Make kasirId optional (marketplace doesn't have kasir)
ALTER TABLE "transactions" ALTER COLUMN "kasirId" DROP NOT NULL;

-- Set default channelId to POS for existing transactions
UPDATE "transactions" SET "channelId" = 'pos-default' WHERE "channelId" IS NULL;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for faster queries
CREATE INDEX "transactions_channelId_idx" ON "transactions"("channelId");
CREATE INDEX "transactions_status_idx" ON "transactions"("status");
CREATE INDEX "transactions_externalOrderId_idx" ON "transactions"("externalOrderId");
