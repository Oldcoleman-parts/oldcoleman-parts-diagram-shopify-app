/*
  Warnings:

  - You are about to drop the column `categoryId` on the `Diagram` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Diagram" DROP CONSTRAINT "Diagram_categoryId_fkey";

-- AlterTable
ALTER TABLE "Diagram" DROP COLUMN "categoryId";

-- CreateTable
CREATE TABLE "DiagramCategory" (
    "diagramId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "DiagramCategory_pkey" PRIMARY KEY ("diagramId","categoryId")
);

-- AddForeignKey
ALTER TABLE "DiagramCategory" ADD CONSTRAINT "DiagramCategory_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "Diagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagramCategory" ADD CONSTRAINT "DiagramCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
