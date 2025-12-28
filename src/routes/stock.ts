import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { emitStockUpdated } from '../lib/socket';

type Variables = {
  user: AuthUser;
};

interface AdjustmentBody {
  variantId: string;
  cabangId: string;
  type: 'add' | 'subtract';
  quantity: number;
  reason?: string;
  notes?: string;
}

interface AlertBody {
  variantId: string;
  cabangId: string;
  minStock: number;
}

const stock = new Hono<{ Variables: Variables }>();

// GET /api/stock/adjustments - Get all stock adjustments with filters
stock.get('/adjustments', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const variantId = c.req.query('variantId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const reason = c.req.query('reason');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const where: any = {};
    
    if (cabangId) where.cabangId = cabangId;
    if (variantId) where.productVariantId = variantId;
    if (reason) where.reason = reason;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
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
        take: limit
      }),
      prisma.stockAdjustment.count({ where })
    ]);
    
    return c.json({
      data: adjustments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching adjustments:', error);
    return c.json({ error: 'Failed to fetch adjustments' }, 500);
  }
});

// POST /api/stock/adjustment - Create a stock adjustment
stock.post('/adjustment', authMiddleware, async (c) => {
  try {
    const body = await c.req.json() as AdjustmentBody;
    const { variantId, cabangId, type, quantity, reason, notes } = body;
    const user = c.get('user');
    const userId = user?.userId;
    
    // Validate input
    if (!variantId || !cabangId || !type || !quantity) {
      return c.json({ error: 'Missing required fields: variantId, cabangId, type, quantity' }, 400);
    }
    
    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401);
    }
    
    if (!['add', 'subtract'].includes(type)) {
      return c.json({ error: 'Type must be "add" or "subtract"' }, 400);
    }
    
    if (quantity <= 0) {
      return c.json({ error: 'Quantity must be greater than 0' }, 400);
    }
    
    // Find the stock record
    const stockRecord = await prisma.stock.findFirst({
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
    
    if (!stockRecord) {
      return c.json({ error: 'Stock record not found for this variant and cabang' }, 404);
    }
    
    const previousQty = stockRecord.quantity;
    const difference = type === 'add' ? quantity : -quantity;
    const newQty = previousQty + difference;
    
    // Check if subtracting would result in negative stock
    if (newQty < 0) {
      return c.json({ 
        error: `Cannot subtract ${quantity}. Current stock is only ${previousQty}` 
      }, 400);
    }
    
    // Map frontend reason to backend enum
    const reasonMap: Record<string, string | null> = {
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
    
    const adjustmentReason = reason ? (reasonMap[reason] || null) : null;
    
    // Create adjustment and update stock in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update stock quantity
      const updatedStock = await tx.stock.update({
        where: { id: stockRecord.id },
        data: { quantity: newQty }
      });
      
      // Create adjustment record
      const adjustment = await tx.stockAdjustment.create({
        data: {
          productVariantId: variantId,
          stockId: stockRecord.id,
          cabangId,
          adjustedById: userId,
          previousQty,
          newQty,
          difference,
          reason: adjustmentReason as any,
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
      productId: stockRecord.productVariant.product.id,
      variantId,
      cabangId,
      quantity: newQty,
      previousQty,
      adjustmentId: result.adjustment.id
    });
    
    return c.json({
      success: true,
      message: `Stock ${type === 'add' ? 'ditambah' : 'dikurangi'} ${quantity}. ${previousQty} → ${newQty}`,
      data: {
        adjustment: result.adjustment,
        newStock: result.stock.quantity
      }
    });
    
  } catch (error: any) {
    console.error('Error creating adjustment:', error);
    return c.json({ error: 'Failed to create adjustment: ' + error.message }, 500);
  }
});

// GET /api/stock/adjustment/:variantId/:cabangId/history - Get adjustment history for a specific variant/cabang
stock.get('/adjustment/:variantId/:cabangId/history', authMiddleware, async (c) => {
  try {
    const variantId = c.req.param('variantId');
    const cabangId = c.req.param('cabangId');
    const limit = parseInt(c.req.query('limit') || '20');
    
    // If cabangId is empty or 'all', fetch for all cabangs
    const whereClause: any = {
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
      take: limit
    });
    
    return c.json({ data: adjustments });
  } catch (error) {
    console.error('Error fetching adjustment history:', error);
    return c.json({ error: 'Failed to fetch adjustment history' }, 500);
  }
});

// POST /api/stock/alert - Set stock alert
stock.post('/alert', authMiddleware, async (c) => {
  try {
    const body = await c.req.json() as AlertBody;
    const { variantId, cabangId, minStock } = body;
    
    if (!variantId || !cabangId || minStock === undefined) {
      return c.json({ error: 'Missing required fields: variantId, cabangId, minStock' }, 400);
    }
    
    if (minStock < 0) {
      return c.json({ error: 'minStock must be >= 0' }, 400);
    }
    
    // Check if stock exists
    const stockRecord = await prisma.stock.findFirst({
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
    
    if (!stockRecord) {
      return c.json({ error: 'Stock not found for this variant and cabang' }, 404);
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
    
    return c.json({
      success: true,
      message: `Alert berhasil diatur! Notifikasi akan muncul jika stock < ${minStock}`,
      data: alert
    });
    
  } catch (error: any) {
    console.error('Error setting alert:', error);
    return c.json({ error: 'Failed to set alert: ' + error.message }, 500);
  }
});

// GET /api/stock/alert/:variantId/:cabangId - Get stock alert
stock.get('/alert/:variantId/:cabangId', authMiddleware, async (c) => {
  try {
    const variantId = c.req.param('variantId');
    const cabangId = c.req.param('cabangId');
    
    const alert = await prisma.stockAlert.findUnique({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId
        }
      }
    });
    
    return c.json({ data: alert });
  } catch (error) {
    console.error('Error fetching alert:', error);
    return c.json({ error: 'Failed to fetch alert' }, 500);
  }
});

// DELETE /api/stock/alert/:variantId/:cabangId - Delete/deactivate stock alert
stock.delete('/alert/:variantId/:cabangId', authMiddleware, async (c) => {
  try {
    const variantId = c.req.param('variantId');
    const cabangId = c.req.param('cabangId');
    
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
    
    return c.json({
      success: true,
      message: 'Alert berhasil dinonaktifkan'
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return c.json({ error: 'Failed to delete alert' }, 500);
  }
});

// GET /api/stock/alerts/low - Get all low stock items
stock.get('/alerts/low', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    
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
      const stockItem = alert.productVariant.stocks.find(s => s.cabangId === alert.cabangId);
      return stockItem && stockItem.quantity < alert.minStock;
    });
    
    return c.json({ data: lowStockItems });
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    return c.json({ error: 'Failed to fetch low stock items' }, 500);
  }
});

// GET /api/stock/alerts - Get all active alerts (for displaying in UI)
stock.get('/alerts', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    
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
    
    return c.json({ data: alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return c.json({ error: 'Failed to fetch alerts' }, 500);
  }
});

export default stock;
