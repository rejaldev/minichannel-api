/**
 * Script untuk hapus semua data transaksi dari database
 * 
 * WARNING: Script ini akan menghapus SEMUA data berikut:
 * - Return & ReturnItem (data return/refund)
 * - PriceDiscrepancy (price discrepancy tracking)
 * - TransactionItem (detail item transaksi)
 * - Transaction (transaksi penjualan)
 * 
 * Data yang TIDAK akan dihapus:
 * - Product & ProductVariant (master produk)
 * - Stock (stok tetap ada)
 * - User, Cabang, Category (master data)
 * - Order & StockTransfer (management data)
 * 
 * Jalankan dengan: node prisma/clear-transactions.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearTransactions() {
  try {
    console.log('🗑️  Starting transaction data cleanup...\n');

    // 1. Hapus ReturnItem dulu (foreign key ke Return)
    const deletedReturnItems = await prisma.returnItem.deleteMany({});
    console.log(`✅ Deleted ${deletedReturnItems.count} return items`);

    // 2. Hapus Return (foreign key ke Transaction)
    const deletedReturns = await prisma.return.deleteMany({});
    console.log(`✅ Deleted ${deletedReturns.count} returns`);

    // 3. Hapus PriceDiscrepancy (foreign key ke Transaction)
    const deletedDiscrepancies = await prisma.priceDiscrepancy.deleteMany({});
    console.log(`✅ Deleted ${deletedDiscrepancies.count} price discrepancies`);

    // 4. Hapus TransactionItem (foreign key ke Transaction)
    const deletedItems = await prisma.transactionItem.deleteMany({});
    console.log(`✅ Deleted ${deletedItems.count} transaction items`);

    // 5. Hapus Transaction (tabel utama)
    const deletedTransactions = await prisma.transaction.deleteMany({});
    console.log(`✅ Deleted ${deletedTransactions.count} transactions`);

    console.log('\n🎉 Transaction data cleanup completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Transactions: ${deletedTransactions.count}`);
    console.log(`   - Transaction Items: ${deletedItems.count}`);
    console.log(`   - Returns: ${deletedReturns.count}`);
    console.log(`   - Return Items: ${deletedReturnItems.count}`);
    console.log(`   - Price Discrepancies: ${deletedDiscrepancies.count}`);
    console.log('\n💡 Stock data, products, and master data are intact.');

  } catch (error) {
    console.error('❌ Error clearing transaction data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Confirm before delete
console.log('⚠️  WARNING: This will DELETE ALL transaction data!');
console.log('   Press Ctrl+C within 5 seconds to cancel...\n');

setTimeout(() => {
  clearTransactions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}, 5000);
