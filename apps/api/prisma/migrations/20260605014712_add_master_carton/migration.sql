/*
  Warnings:

  - You are about to drop the column `estimatedFinish` on the `wips` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `wips` DROP COLUMN `estimatedFinish`;

-- CreateTable
CREATE TABLE `master_cartons` (
    `id` VARCHAR(191) NOT NULL,
    `cartonCode` VARCHAR(191) NOT NULL,
    `toyNameItemId` VARCHAR(191) NOT NULL,
    `partNumberCode` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `master_cartons_cartonCode_key`(`cartonCode`),
    INDEX `master_cartons_toyNameItemId_idx`(`toyNameItemId`),
    INDEX `master_cartons_partNumberCode_idx`(`partNumberCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `master_cartons` ADD CONSTRAINT `master_cartons_toyNameItemId_fkey` FOREIGN KEY (`toyNameItemId`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
