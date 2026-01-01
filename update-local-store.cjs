const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateLocalStore() {
  try {
    console.log('🔄 Updating local database...\n');

    // 1. Update storeName di semua printer_settings
    const updatedSettings = await prisma.printerSettings.updateMany({
      data: {
        storeName: 'Harapan Abah'
      }
    });
    console.log(`✅ Updated ${updatedSettings.count} printer settings with storeName = "Harapan Abah"\n`);

    // 2. Cek user owner@toko.com
    const owner = await prisma.user.findUnique({
      where: { email: 'owner@toko.com' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        cabangId: true
      }
    });

    if (owner) {
      console.log('Owner user:', owner);
      
      // Cek cabang Gondrong
      const gondrong = await prisma.cabang.findFirst({
        where: {
          name: { contains: 'Gondrong', mode: 'insensitive' }
        }
      });

      if (gondrong && owner.cabangId !== gondrong.id) {
        console.log(`\n🔄 Updating owner cabangId to Gondrong: ${gondrong.id}`);
        await prisma.user.update({
          where: { email: 'owner@toko.com' },
          data: { cabangId: gondrong.id }
        });
        console.log('✅ Owner assigned to Cabang Gondrong');
      } else if (gondrong) {
        console.log('✅ Owner already assigned to Cabang Gondrong');
      }
    }

    // 3. Show final state
    console.log('\n📊 Final state:');
    const settings = await prisma.printerSettings.findMany({
      select: {
        id: true,
        storeName: true,
        branchName: true,
        cabangId: true
      }
    });
    console.log('Printer Settings:', JSON.stringify(settings, null, 2));

    const users = await prisma.user.findMany({
      where: {
        email: { in: ['owner@toko.com', 'kasir@toko.com'] }
      },
      select: {
        email: true,
        name: true,
        role: true,
        cabangId: true
      }
    });
    console.log('\nUsers:', JSON.stringify(users, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateLocalStore();
