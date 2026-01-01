const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStore() {
  try {
    const settings = await prisma.printerSettings.findMany({
      select: {
        id: true,
        storeName: true,
        branchName: true,
        cabangId: true
      }
    });
    console.log('Printer Settings (Local Database):');
    console.log(JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStore();
