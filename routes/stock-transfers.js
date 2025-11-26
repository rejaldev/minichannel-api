const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

// Generate transfer number
function generateTransferNo() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TRF-${dateStr}-${random}`;
}

// Create stock transfer (ADMIN only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Only ADMIN and OWNER can create transfers
    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only ADMIN can transfer stock' });
    }

    const { variantId, fromCabangId, toCabangId, quantity, notes } = req.body;

    // Validation
    if (!variantId || !fromCabangId || !toCabangId || !quantity) {
      return res.status(400).json({ 
        error: 'variantId, fromCabangId, toCabangId, and quantity are required' 
      });
    }

    if (fromCabangId === toCabangId) {
      return res.status(400).json({ error: 'Cannot transfer to the same cabang' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    // Check stock availability in source cabang
    const sourceStock = await prisma.stock.findUnique({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId: fromCabangId
        }
      }
    });

    if (!sourceStock) {
      return res.status(404).json({ error: 'Source stock not found' });
    }

    if (sourceStock.quantity < quantity) {
      return res.status(400).json({ 
        error: `Insufficient stock. Available: ${sourceStock.quantity}` 
      });
    }

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // Deduct from source
      await tx.stock.update({
        where: {
          productVariantId_cabangId: {
            productVariantId: variantId,
            cabangId: fromCabangId
          }
        },
        data: {
          quantity: { decrement: quantity }
        }
      });

      // Add to destination (upsert in case doesn't exist)
      await tx.stock.upsert({
        where: {
          productVariantId_cabangId: {
            productVariantId: variantId,
            cabangId: toCabangId
          }
        },
        update: {
          quantity: { increment: quantity }
        },
        create: {
          productVariantId: variantId,
          cabangId: toCabangId,
          quantity: quantity,
          price: sourceStock.price // Copy price from source
        }
      });

      // Create transfer record
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNo: generateTransferNo(),
          variantId,
          fromCabangId,
          toCabangId,
          quantity,
          transferredById: req.user.userId,
          notes: notes || null,
          status: 'COMPLETED'
        },
        include: {
          productVariant: {
            include: {
              product: {
                select: { id: true, name: true }
              }
            }
          },
          fromCabang: {
            select: { id: true, name: true }
          },
          toCabang: {
            select: { id: true, name: true }
          },
          transferredBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      return transfer;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create stock transfer error:', error);
    res.status(500).json({ error: 'Failed to create stock transfer' });
  }
});

// Get all stock transfers
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Only ADMIN, MANAGER, OWNER can view transfers
    if (req.user.role === 'KASIR') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { cabangId, variantId, status } = req.query;

    // Build filter
    const where = {};
    
    if (status) {
      where.status = status;
    }

    if (cabangId) {
      where.OR = [
        { fromCabangId: cabangId },
        { toCabangId: cabangId }
      ];
    }

    if (variantId) {
      where.variantId = variantId;
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        productVariant: {
          include: {
            product: {
              select: { id: true, name: true }
            }
          }
        },
        fromCabang: {
          select: { id: true, name: true }
        },
        toCabang: {
          select: { id: true, name: true }
        },
        transferredBy: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(transfers);
  } catch (error) {
    console.error('Get stock transfers error:', error);
    res.status(500).json({ error: 'Failed to fetch stock transfers' });
  }
});

// Get single transfer
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    // Only ADMIN, MANAGER, OWNER can view transfers
    if (req.user.role === 'KASIR') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        productVariant: {
          include: {
            product: true
          }
        },
        fromCabang: true,
        toCabang: true,
        transferredBy: {
          select: { id: true, name: true, email: true, role: true }
        }
      }
    });

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.json(transfer);
  } catch (error) {
    console.error('Get transfer error:', error);
    res.status(500).json({ error: 'Failed to fetch transfer' });
  }
});

// Get transfer statistics
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    // Only ADMIN, MANAGER, OWNER can view stats
    if (req.user.role === 'KASIR') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { cabangId } = req.query;

    let where = {};
    if (cabangId) {
      where = {
        OR: [
          { fromCabangId: cabangId },
          { toCabangId: cabangId }
        ]
      };
    }

    const [total, completed, pending] = await Promise.all([
      prisma.stockTransfer.count({ where }),
      prisma.stockTransfer.count({ 
        where: { ...where, status: 'COMPLETED' } 
      }),
      prisma.stockTransfer.count({ 
        where: { ...where, status: 'PENDING' } 
      })
    ]);

    // Get total quantity transferred
    const transfers = await prisma.stockTransfer.findMany({
      where,
      select: { quantity: true }
    });

    const totalQuantity = transfers.reduce((sum, t) => sum + t.quantity, 0);

    res.json({
      total,
      completed,
      pending,
      totalQuantity
    });
  } catch (error) {
    console.error('Get transfer stats error:', error);
    res.status(500).json({ error: 'Failed to fetch transfer statistics' });
  }
});

module.exports = router;
