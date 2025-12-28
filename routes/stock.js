const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { emitStockUpdated } = require('../lib/socket');

// GET /api/stock/adjustments - Get all stock adjustments with filters
router.get('/adjustments', authMiddleware, async (req, res) => {
  try {
    const { cabangId, variantId, startDate, endDate, reason, page = 1, limit = 50 } = req.query;
    
    const where = {};
    
    if (cabangId) where.cabangId = cabangId;
    if (variantId) where.productVariantId = variantId;
    if (reason) where.reason = reason;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [adjustments, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where,
        include: {
          productVariant: {
            include: {
              product: {
                select: { id: true, name: true }
              }
            }
          },
          cabang: { select: { id: true, name: true } },
          adjustedBy: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.stockAdjustment.count({ where })
    ]);
    
    res.json({
      data: adjustments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching adjustments:', error);
    res.status(500).json({ error: 'Failed to fetch adjustments' });
  }
});

// POST /api/stock/adjustment - Create a stock adjustment
router.post('/adjustment', authMiddleware, async (req, res) => {
  try {
    const { variantId, cabangId, type, quantity, reason, notes } = req.body;
    const userId = req.user?.userId;
    
    // Validate input
    if (!variantId || !cabangId || !type || !quantity) {
      return res.status(400).json({ error: 'Missing required fields: variantId, cabangId, type, quantity' });
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (!['add', 'subtract'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "add" or "subtract"' });
    }
    
    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    
    // Find the stock record
    const stock = await prisma.stock.findFirst({
      where: {
        productVariantId: variantId,
        cabangId
      },
      include: {
        productVariant: {
          include: {
            product: { select: { id: true, name: true } }
          }
        },
        cabang: { select: { name: true } }
      }
    });
    
    if (!stock) {
      return res.status(404).json({ error: 'Stock record not found for this variant and cabang' });
    }
    
    const previousQty = stock.quantity;
    const difference = type === 'add' ? quantity : -quantity;
    const newQty = previousQty + difference;
    
    // Check if subtracting would result in negative stock
    if (newQty < 0) {
      return res.status(400).json({ 
        error: `Cannot subtract ${quantity}. Current stock is only ${previousQty}` 
      });
    }
    
    // Map frontend reason to backend enum
    const reasonMap = {
      'restock': null,
      'return': null,
      'found': null,
      'correction': 'STOCK_OPNAME',
      'damaged': 'DAMAGED',
      'expired': 'DAMAGED',
      'lost': 'LOST',
      'sample': 'OTHER',
      'other_add': 'OTHER',
      'other_subtract': 'OTHER'
    };
    
    const adjustmentReason = reasonMap[reason] || null;
    
    // Create adjustment and update stock in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update stock quantity
      const updatedStock = await tx.stock.update({
        where: { id: stock.id },
        data: { quantity: newQty }
      });
      
      // Create adjustment record
      const adjustment = await tx.stockAdjustment.create({
        data: {
          productVariantId: variantId,
          stockId: stock.id,
          cabangId,
          adjustedById: userId,
          previousQty,
          newQty,
          difference,
          reason: adjustmentReason,
          notes: notes || `${type === 'add' ? 'Tambah' : 'Kurang'}: ${reason}`
        },
        include: {
          productVariant: {
            include: {
              product: { select: { id: true, name: true } }
            }
          },
          cabang: { select: { id: true, name: true } },
          adjustedBy: { select: { id: true, name: true } }
        }
      });
      
      return { stock: updatedStock, adjustment };
    });
    
    // Emit socket event for real-time update
    emitStockUpdated({
      productId: stock.productVariant.product.id,
      variantId,
      cabangId,
      quantity: newQty,
      previousQty,
      adjustmentId: result.adjustment.id
    });
    
    res.json({
      success: true,
      message: `Stock ${type === 'add' ? 'ditambah' : 'dikurangi'} ${quantity}. ${previousQty} → ${newQty}`,
      data: {
        adjustment: result.adjustment,
        newStock: result.stock.quantity
      }
    });
    
  } catch (error) {
    console.error('Error creating adjustment:', error);
    res.status(500).json({ error: 'Failed to create adjustment: ' + error.message });
  }
});

// GET /api/stock/adjustment/:variantId/:cabangId/history - Get adjustment history for a specific variant/cabang
router.get('/adjustment/:variantId/:cabangId/history', authMiddleware, async (req, res) => {
  try {
    const { variantId, cabangId } = req.params;
    const { limit = 20 } = req.query;
    
    // If cabangId is empty or 'all', fetch for all cabangs
    const whereClause = {
      productVariantId: variantId,
      ...(cabangId && cabangId !== 'all' ? { cabangId } : {})
    };
    
    const adjustments = await prisma.stockAdjustment.findMany({
      where: whereClause,
      include: {
        adjustedBy: { select: { id: true, name: true } },
        cabang: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    
    res.json({ data: adjustments });
  } catch (error) {
    console.error('Error fetching adjustment history:', error);
    res.status(500).json({ error: 'Failed to fetch adjustment history' });
  }
});

// POST /api/stock/alert - Set stock alert
router.post('/alert', authMiddleware, async (req, res) => {
  try {
    const { variantId, cabangId, minStock } = req.body;
    
    if (!variantId || !cabangId || minStock === undefined) {
      return res.status(400).json({ error: 'Missing required fields: variantId, cabangId, minStock' });
    }
    
    if (minStock < 0) {
      return res.status(400).json({ error: 'minStock must be >= 0' });
    }
    
    // Check if stock exists
    const stock = await prisma.stock.findFirst({
      where: {
        productVariantId: variantId,
        cabangId
      },
      include: {
        productVariant: {
          include: {
            product: { select: { name: true } }
          }
        },
        cabang: { select: { name: true } }
      }
    });
    
    if (!stock) {
      return res.status(404).json({ error: 'Stock not found for this variant and cabang' });
    }
    
    // Create or update alert
    const alert = await prisma.stockAlert.upsert({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId
        }
      },
      update: {
        minStock,
        isActive: true
      },
      create: {
        productVariantId: variantId,
        cabangId,
        minStock,
        isActive: true
      },
      include: {
        productVariant: {
          include: {
            product: { select: { name: true } }
          }
        },
        cabang: { select: { name: true } }
      }
    });
    
    res.json({
      success: true,
      message: `Alert berhasil diatur! Notifikasi akan muncul jika stock < ${minStock}`,
      data: alert
    });
    
  } catch (error) {
    console.error('Error setting alert:', error);
    res.status(500).json({ error: 'Failed to set alert: ' + error.message });
  }
});

// GET /api/stock/alert/:variantId/:cabangId - Get stock alert
router.get('/alert/:variantId/:cabangId', authMiddleware, async (req, res) => {
  try {
    const { variantId, cabangId } = req.params;
    
    const alert = await prisma.stockAlert.findUnique({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId
        }
      }
    });
    
    res.json({ data: alert });
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

// DELETE /api/stock/alert/:variantId/:cabangId - Delete/deactivate stock alert
router.delete('/alert/:variantId/:cabangId', authMiddleware, async (req, res) => {
  try {
    const { variantId, cabangId } = req.params;
    
    await prisma.stockAlert.update({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId
        }
      },
      data: {
        isActive: false
      }
    });
    
    res.json({
      success: true,
      message: 'Alert berhasil dinonaktifkan'
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// GET /api/stock/alerts/low - Get all low stock items
router.get('/alerts/low', authMiddleware, async (req, res) => {
  try {
    const { cabangId } = req.query;
    
    // Find all active alerts
    const alerts = await prisma.stockAlert.findMany({
      where: {
        isActive: true,
        ...(cabangId && { cabangId })
      },
      include: {
        productVariant: {
          include: {
            product: true,
            stocks: {
              where: cabangId ? { cabangId } : {}
            }
          }
        },
        cabang: true
      }
    });
    
    // Filter to only include items where current stock < minStock
    const lowStockItems = alerts.filter(alert => {
      const stock = alert.productVariant.stocks.find(s => s.cabangId === alert.cabangId);
      return stock && stock.quantity < alert.minStock;
    });
    
    res.json({ data: lowStockItems });
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

// GET /api/stock/alerts - Get all active alerts (for displaying in UI)
router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const { cabangId } = req.query;
    
    const alerts = await prisma.stockAlert.findMany({
      where: {
        isActive: true,
        ...(cabangId && { cabangId })
      },
      select: {
        productVariantId: true,
        cabangId: true,
        minStock: true,
        isActive: true
      }
    });
    
    res.json({ data: alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

module.exports = router;
