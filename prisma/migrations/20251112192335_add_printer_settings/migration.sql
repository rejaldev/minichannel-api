-- CreateTable
CREATE TABLE "printer_settings" (
    "id" TEXT NOT NULL,
    "cabangId" TEXT,
    "autoPrintEnabled" BOOLEAN NOT NULL DEFAULT true,
    "printerName" TEXT,
    "paperWidth" INTEGER NOT NULL DEFAULT 80,
    "showPreview" BOOLEAN NOT NULL DEFAULT false,
    "printCopies" INTEGER NOT NULL DEFAULT 1,
    "storeName" TEXT NOT NULL DEFAULT 'MINICHANNEL',
    "branchName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "footerText1" TEXT,
    "footerText2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "printer_settings_cabangId_key" ON "printer_settings"("cabangId");

-- AddForeignKey
ALTER TABLE "printer_settings" ADD CONSTRAINT "printer_settings_cabangId_fkey" FOREIGN KEY ("cabangId") REFERENCES "cabang"("id") ON DELETE SET NULL ON UPDATE CASCADE;
