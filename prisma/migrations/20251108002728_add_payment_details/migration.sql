-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'DEBIT';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "cardLastDigits" TEXT,
ADD COLUMN     "referenceNo" TEXT,
ADD COLUMN     "senderName" TEXT;
