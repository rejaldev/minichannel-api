const cron = require('node-cron');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const prisma = require('./prisma');

const BACKUP_DIR = path.join(__dirname, '../backups');

// Ensure backup directory exists
const ensureBackupDir = async () => {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }
};

// Perform backup (JSON format - cross-platform compatible)
const performBackup = async () => {
  try {
    console.log('[Auto Backup] Starting scheduled backup...');
    
    await ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `auto-backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    
    // Export all data from all tables using Prisma
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        type: 'auto'
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
    
    // Save backup record
    await prisma.settings.upsert({
      where: { key: 'last_backup' },
      update: { 
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'auto'
        })
      },
      create: { 
        key: 'last_backup',
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'auto'
        })
      }
    });
    
    console.log(`[Auto Backup] Backup completed: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Clean up old backups (keep last 7 days)
    await cleanupOldBackups();
    
  } catch (error) {
    console.error('[Auto Backup] Error:', error.message);
  }
};

// Clean up backups older than 7 days
const cleanupOldBackups = async () => {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    for (const file of files) {
      const filepath = path.join(BACKUP_DIR, file);
      const stats = await fs.stat(filepath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filepath);
        console.log(`[Auto Backup] Deleted old backup: ${file}`);
      }
    }
  } catch (error) {
    console.error('[Auto Backup] Cleanup error:', error.message);
  }
};

// Check if auto backup is enabled
const isAutoBackupEnabled = async () => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'auto_backup_enabled' }
    });
    return setting ? JSON.parse(setting.value) : false;
  } catch (error) {
    console.error('[Auto Backup] Error checking status:', error.message);
    return false;
  }
};

// Initialize scheduler
const initBackupScheduler = () => {
  // Schedule backup daily at 00:00 (midnight)
  cron.schedule('0 0 * * *', async () => {
    const enabled = await isAutoBackupEnabled();
    if (enabled) {
      await performBackup();
    } else {
      console.log('[Auto Backup] Skipped (disabled)');
    }
  });
  
  console.log('[Auto Backup] Scheduler initialized (daily at 00:00)');
};

module.exports = { initBackupScheduler, performBackup };
