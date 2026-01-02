const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearAll() {
  console.log('Clearing all data...\n');

  // Delete in correct order (respect foreign keys)
  
  // 1. Transaction related
  const priceDisc = await prisma.priceDiscrepancy.deleteMany();
  console.log(`Deleted ${priceDisc.count} price discrepancies`);
  
  const returnItems = await prisma.returnItem.deleteMany();
  console.log(`Deleted ${returnItems.count} return items`);
  
  const returns = await prisma.return.deleteMany();
  console.log(`Deleted ${returns.count} returns`);
  
  const transItems = await prisma.transactionItem.deleteMany();
  console.log(`Deleted ${transItems.count} transaction items`);
  
  const transactions = await prisma.transaction.deleteMany();
  console.log(`Deleted ${transactions.count} transactions`);

  // 2. Stock related
  const stockAlerts = await prisma.stockAlert.deleteMany();
  console.log(`Deleted ${stockAlerts.count} stock alerts`);
  
  const stockAdj = await prisma.stockAdjustment.deleteMany();
  console.log(`Deleted ${stockAdj.count} stock adjustments`);
  
  const stockTransfers = await prisma.stockTransfer.deleteMany();
  console.log(`Deleted ${stockTransfers.count} stock transfers`);
  
  const stocks = await prisma.stock.deleteMany();
  console.log(`Deleted ${stocks.count} stocks`);
  
  const channelStocks = await prisma.channelStock.deleteMany();
  console.log(`Deleted ${channelStocks.count} channel stocks`);

  // 3. Orders
  const orders = await prisma.order.deleteMany();
  console.log(`Deleted ${orders.count} orders`);

  // 4. Product related
  const variants = await prisma.productVariant.deleteMany();
  console.log(`Deleted ${variants.count} product variants`);
  
  const variantOptions = await prisma.variantOption.deleteMany();
  console.log(`Deleted ${variantOptions.count} variant options`);
  
  const variantTypes = await prisma.variantType.deleteMany();
  console.log(`Deleted ${variantTypes.count} variant types`);
  
  const products = await prisma.product.deleteMany();
  console.log(`Deleted ${products.count} products`);

  console.log('\n✅ All transactions and products deleted!');
  
  await prisma.$disconnect();
}

clearAll().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
