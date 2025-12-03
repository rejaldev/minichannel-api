/*
  Warnings:

  - You are about to drop the column `printCopies` on the `printer_settings` table. All the data in the column will be lost.
  - You are about to drop the column `showPreview` on the `printer_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "printer_settings" DROP COLUMN "printCopies",
DROP COLUMN "showPreview";
