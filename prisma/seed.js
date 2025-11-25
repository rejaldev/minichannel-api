const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Buat Cabang
  const cabang = await prisma.cabang.upsert({
    where: { name: 'Cabang Pusat' },
    update: {},
    create: {
      name: 'Cabang Pusat',
      address: 'Jl. Contoh No. 123',
      phone: '081234567890'
    }
  });

  console.log('✅ Cabang created:', cabang.name);

  // Buat User Owner
  const hashedPassword = await bcrypt.hash('owner123', 10);
  
  const owner = await prisma.user.upsert({
    where: { email: 'owner@toko.com' },
    update: {},
    create: {
      email: 'owner@toko.com',
      password: hashedPassword,
      name: 'Owner Toko',
      role: 'OWNER',
      cabangId: cabang.id
    }
  });

  console.log('✅ Owner created:', owner.email);

  // Buat User Kasir
  const hashedPasswordKasir = await bcrypt.hash('kasir123', 10);
  
  const kasir = await prisma.user.upsert({
    where: { email: 'kasir@toko.com' },
    update: {},
    create: {
      email: 'kasir@toko.com',
      password: hashedPasswordKasir,
      name: 'Kasir 1',
      role: 'KASIR',
      cabangId: cabang.id
    }
  });

  console.log('✅ Kasir created:', kasir.email);

  // Buat Kategori
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Seragam SD' },
      update: {},
      create: {
        name: 'Seragam SD',
        description: 'Seragam Sekolah Dasar'
      }
    }),
    prisma.category.upsert({
      where: { name: 'Seragam SMP' },
      update: {},
      create: {
        name: 'Seragam SMP',
        description: 'Seragam Sekolah Menengah Pertama'
      }
    }),
    prisma.category.upsert({
      where: { name: 'Perlengkapan Sekolah' },
      update: {},
      create: {
        name: 'Perlengkapan Sekolah',
        description: 'Tas, Sepatu, Topi, dll'
      }
    })
  ]);

  console.log('✅ Categories created:', categories.length);

  // Buat Default Settings
  await prisma.settings.upsert({
    where: { key: 'minStock' },
    update: {},
    create: {
      key: 'minStock',
      value: '5'
    }
  });

  console.log('✅ Default settings created: minStock = 5');

  console.log('');
  console.log('🎉 Seeding completed!');
  console.log('');
  console.log('📋 Default Users:');
  console.log('Owner:');
  console.log('  Email: owner@toko.com');
  console.log('  Password: owner123');
  console.log('');
  console.log('Kasir:');
  console.log('  Email: kasir@toko.com');
  console.log('  Password: kasir123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
