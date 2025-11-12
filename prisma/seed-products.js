const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedProducts() {
  console.log('🌱 Seeding products...');

  // Get cabang
  const cabang = await prisma.cabang.findFirst();
  if (!cabang) {
    console.error('❌ No cabang found! Run main seed first.');
    return;
  }

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Seragam SD' },
      update: {},
      create: { name: 'Seragam SD', description: 'Seragam sekolah dasar' }
    }),
    prisma.category.upsert({
      where: { name: 'Seragam SMP' },
      update: {},
      create: { name: 'Seragam SMP', description: 'Seragam sekolah menengah pertama' }
    }),
    prisma.category.upsert({
      where: { name: 'Perlengkapan' },
      update: {},
      create: { name: 'Perlengkapan', description: 'Perlengkapan sekolah' }
    })
  ]);

  console.log('✅ Categories created');

  // Create products with variants
  const bajuSD = await prisma.product.create({
    data: {
      name: 'Baju Seragam SD Putih Lengan Pendek',
      description: 'Baju seragam SD warna putih lengan pendek',
      categoryId: categories[0].id,
      price: 45000
    }
  });

  // Create variants for Baju SD (nomor 6-18)
  const bajuVariants = [];
  for (let i = 6; i <= 18; i += 2) {
    const variant = await prisma.productVariant.create({
      data: {
        productId: bajuSD.id,
        variantName: 'Nomor',
        variantValue: i.toString(),
        sku: `BAJU-SD-${i}`
      }
    });
    bajuVariants.push(variant);
  }

  console.log('✅ Baju SD variants created');

  // Create Celana SD
  const celanaSD = await prisma.product.create({
    data: {
      name: 'Celana SD Panjang Karet',
      description: 'Celana panjang SD dengan karet pinggang',
      categoryId: categories[0].id,
      price: 55000
    }
  });

  // Create variants for Celana SD (nomor 26-36)
  const celanaVariants = [];
  for (let i = 26; i <= 36; i += 2) {
    const variant = await prisma.productVariant.create({
      data: {
        productId: celanaSD.id,
        variantName: 'Ukuran',
        variantValue: i.toString(),
        sku: `CELANA-SD-${i}`
      }
    });
    celanaVariants.push(variant);
  }

  console.log('✅ Celana SD variants created');

  // Create initial stock for all variants
  for (const variant of [...bajuVariants, ...celanaVariants]) {
    await prisma.stock.create({
      data: {
        productVariantId: variant.id,
        cabangId: cabang.id,
        quantity: Math.floor(Math.random() * 50) + 10, // Random 10-60
        minStock: 5
      }
    });
  }

  console.log('✅ Stock created for all variants');
  console.log('🎉 Product seeding complete!');
}

seedProducts()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
