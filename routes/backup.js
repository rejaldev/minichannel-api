const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware, ownerOnly } = require('../middleware/auth');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Create backups directory if not exists
const BACKUP_DIR = path.join(__dirname, '../backups');
const ensureBackupDir = async () => {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }
};

// Manual Database Backup (JSON format - cross-platform compatible)
router.post('/database', authMiddleware, ownerOnly, async (req, res) => {
  try {
    await ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    
    // Export all data from all tables using Prisma
    console.log('[Backup] Starting database backup...');
    
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0'
      },
      data: {
        users: await prisma.user.findMany(),
        categories: await prisma.category.findMany(),
        products: await prisma.product.findMany(),
        productVariants: await prisma.productVariant.findMany(),
        variantTypes: await prisma.variantType.findMany(),
        variantOptions: await prisma.variantOption.findMany(),
        cabangs: await prisma.cabang.findMany(),
        stocks: await prisma.stock.findMany(),
        stockAdjustments: await prisma.stockAdjustment.findMany(),
        transactions: await prisma.transaction.findMany(),
        transactionItems: await prisma.transactionItem.findMany(),
        priceDiscrepancies: await prisma.priceDiscrepancy.findMany(),
        stockTransfers: await prisma.stockTransfer.findMany(),
        returns: await prisma.return.findMany(),
        returnItems: await prisma.returnItem.findMany(),
        orders: await prisma.order.findMany(),
        settings: await prisma.settings.findMany(),
        printerSettings: await prisma.printerSettings.findMany()
      }
    };
    
    // Write to file
    await fs.writeFile(filepath, JSON.stringify(backupData, null, 2), 'utf8');
    
    // Get file stats
    const stats = await fs.stat(filepath);
    
    // Save backup record to database
    await prisma.settings.upsert({
      where: { key: 'last_backup' },
      update: { 
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'manual'
        })
      },
      create: { 
        key: 'last_backup',
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'manual'
        })
      }
    });
    
    console.log(`[Backup] Completed: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    res.json({ 
      success: true, 
      filename,
      size: stats.size,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Auto Backup Status
router.get('/auto-status', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'auto_backup_enabled' }
    });
    
    const enabled = setting ? JSON.parse(setting.value) : false;
    res.json({ enabled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle Auto Backup
router.post('/auto-backup', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    await prisma.settings.upsert({
      where: { key: 'auto_backup_enabled' },
      update: { value: JSON.stringify(enabled) },
      create: { key: 'auto_backup_enabled', value: JSON.stringify(enabled) }
    });
    
    res.json({ success: true, enabled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Last Backup Info
router.get('/last-backup', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'last_backup' }
    });
    
    if (!setting) {
      return res.json({ lastBackup: null });
    }
    
    const data = JSON.parse(setting.value);
    res.json({ lastBackup: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export Transactions to CSV
router.get('/export/transactions', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true
              }
            }
          }
        },
        kasir: {
          select: {
            name: true
          }
        },
        cabang: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Convert to CSV
    const csvRows = [];
    
    // Header
    csvRows.push([
      'Transaction ID',
      'Date',
      'Cashier',
      'Branch',
      'Product',
      'Variant',
      'Quantity',
      'Price',
      'Subtotal',
      'Payment Method',
      'Total Amount',
      'Cash',
      'Change'
    ].join(','));
    
    // Data rows
    transactions.forEach(transaction => {
      transaction.items.forEach(item => {
        csvRows.push([
          transaction.id,
          new Date(transaction.createdAt).toLocaleString('id-ID'),
          transaction.kasir.name,
          transaction.cabang.name,
          item.productVariant.product.name,
          item.productVariant.name,
          item.quantity,
          item.price,
          item.quantity * item.price,
          transaction.paymentMethod,
          transaction.totalAmount,
          transaction.cashAmount || 0,
          transaction.changeAmount || 0
        ].map(val => `"${val}"`).join(','));
      });
    });
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=transactions-${Date.now()}.csv`);
    res.send('\uFEFF' + csv); // Add BOM for Excel UTF-8 support
  } catch (error) {
    console.error('Export transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export Products to CSV
router.get('/export/products', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        variants: {
          include: {
            stocks: {
              include: {
                cabang: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        },
        category: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    // Convert to CSV
    const csvRows = [];
    
    // Header
    csvRows.push([
      'Product ID',
      'Product Name',
      'Category',
      'Type',
      'Variant',
      'SKU',
      'Price',
      'Branch',
      'Stock Quantity',
      'Min Stock',
      'Created Date'
    ].join(','));
    
    // Data rows
    products.forEach(product => {
      product.variants.forEach(variant => {
        variant.stocks.forEach(stock => {
          csvRows.push([
            product.id,
            product.name,
            product.category?.name || '-',
            product.type,
            variant.name,
            variant.sku || '-',
            variant.price || 0,
            stock.cabang.name,
            stock.quantity,
            stock.minStock,
            new Date(product.createdAt).toLocaleDateString('id-ID')
          ].map(val => `"${val}"`).join(','));
        });
      });
    });
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=products-${Date.now()}.csv`);
    res.send('\uFEFF' + csv); // Add BOM for Excel UTF-8 support
  } catch (error) {
    console.error('Export products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export Report to PDF (simplified - returns JSON data for now)
router.get('/export/report', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Get transactions in date range
    const whereClause = {};
    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }
    
    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true
              }
            }
          }
        },
        cabang: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Calculate summary
    const summary = {
      totalTransactions: transactions.length,
      totalRevenue: transactions.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0),
      totalItems: transactions.reduce((sum, t) => sum + t.items.length, 0),
      byPaymentMethod: {},
      byBranch: {},
      topProducts: {}
    };
    
    // Aggregate by payment method
    transactions.forEach(t => {
      summary.byPaymentMethod[t.paymentMethod] = 
        (summary.byPaymentMethod[t.paymentMethod] || 0) + parseFloat(t.totalAmount);
      
      summary.byBranch[t.cabang.name] = 
        (summary.byBranch[t.cabang.name] || 0) + parseFloat(t.totalAmount);
      
      t.items.forEach(item => {
        const productName = item.productVariant.product.name;
        if (!summary.topProducts[productName]) {
          summary.topProducts[productName] = { quantity: 0, revenue: 0 };
        }
        summary.topProducts[productName].quantity += item.quantity;
        summary.topProducts[productName].revenue += item.quantity * parseFloat(item.price);
      });
    });
    
    // For now, return JSON (can be converted to PDF on frontend using browser print or jsPDF)
    res.json({
      summary,
      transactions: transactions.slice(0, 100), // Limit to 100 for performance
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset Settings to Default
router.post('/reset-settings', authMiddleware, ownerOnly, async (req, res) => {
  try {
    // Delete all custom settings except critical ones
    await prisma.settings.deleteMany({
      where: {
        key: {
          notIn: ['last_backup', 'auto_backup_enabled']
        }
      }
    });
    
    res.json({ success: true, message: 'Settings reset to default' });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
