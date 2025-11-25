-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "bankName2" TEXT,
ADD COLUMN     "isSplitPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentAmount1" DOUBLE PRECISION,
ADD COLUMN     "paymentAmount2" DOUBLE PRECISION,
ADD COLUMN     "paymentMethod2" "PaymentMethod",
ADD COLUMN     "referenceNo2" TEXT;
