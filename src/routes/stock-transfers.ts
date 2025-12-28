import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { emitStockUpdated } from '../lib/socket';

type Variables = {
  user: AuthUser;
};

interface TransferBody {
  variantId: string;
  fromCabangId: string;
  toCabangId: string;
  quantity: number;
  notes?: string;
}

// Generate transfer number
function generateTransferNo(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TRF-${dateStr}-${random}`;
}

const stockTransfers = new Hono<{ Variables: Variables }>();

// Create stock transfer request
// ADMIN: Creates with PENDING status (needs approval)
// MANAGER/OWNER: Creates with COMPLETED status (auto-approved)
stockTransfers.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Only ADMIN, MANAGER, OWNER can create transfers
    if (user.role === 'KASIR') {
      return c.json({ error: 'Access denied' }, 403);
    }

    const body = await c.req.json() as TransferBody;
    const { variantId, fromCabangId, toCabangId, quantity, notes } = body;

    // Validation
    if (!variantId || !fromCabangId || !toCabangId || !quantity) {
      return c.json({ 
        error: 'variantId, fromCabangId, toCabangId, and quantity are required' 
      }, 400);
    }

    if (fromCabangId === toCabangId) {
      return c.json({ error: 'Cannot transfer to the same cabang' }, 400);
    }

    if (quantity <= 0) {
      return c.json({ error: 'Quantity must be greater than 0' }, 400);
    }

    // Check stock availability in source cabang
    const sourceStock = await prisma.stock.findUnique({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId: fromCabangId
        }
      },
      include: {
        productVariant: {
          include: {
            product: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!sourceStock) {
      return c.json({ error: 'Source stock not found' }, 404);
    }

    if (sourceStock.quantity < quantity) {
      return c.json({ 
        error: `Insufficient stock. Available: ${sourceStock.quantity}` 
      }, 400);
    }

    // Determine if auto-approve (MANAGER/OWNER) or needs approval (ADMIN)
    const isAutoApprove = user.role === 'MANAGER' || user.role === 'OWNER';
    const status = isAutoApprove ? 'COMPLETED' : 'PENDING';

    // Create transfer record
    const result = await prisma.$transaction(async (tx) => {
      // Create transfer record first
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNo: generateTransferNo(),
          variantId,
          fromCabangId,
          toCabangId,
          quantity,
          transferredById: user.userId,
          notes: notes || null,
          status
        },
        include: {
          productVariant: {
            include: {
              product: { select: { id: true, name: true } }
            }
          },
          fromCabang: { select: { id: true, name: true } },
          toCabang: { select: { id: true, name: true } },
          transferredBy: { select: { id: true, name: true, email: true, role: true } }
        }
      });

      // If auto-approved, update stock immediately
      if (isAutoApprove) {
        // Deduct from source
        await tx.stock.update({
          where: {
            productVariantId_cabangId: {
              productVariantId: variantId,
              cabangId: fromCabangId
            }
          },
          data: { quantity: { decrement: quantity } }
        });

        // Add to destination (upsert in case doesn't exist)
        await tx.stock.upsert({
          where: {
            productVariantId_cabangId: {
              productVariantId: variantId,
              cabangId: toCabangId
            }
          },
          update: { quantity: { increment: quantity } },
          create: {
            productVariantId: variantId,
            cabangId: toCabangId,
            quantity: quantity,
            price: sourceStock.price
          }
        });
      }

      return transfer;
    });

    // Emit socket event if completed
    if (isAutoApprove) {
      emitStockUpdated({
        type: 'transfer',
        transferId: result.id,
        fromCabangId,
        toCabangId,
        variantId,
        quantity
      });
    }

    return c.json(result, 201);
  } catch (error) {
    console.error('Create stock transfer error:', error);
    return c.json({ error: 'Failed to create stock transfer' }, 500);
  }
});

// Approve transfer (MANAGER/OWNER only)
stockTransfers.patch('/:id/approve', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Only MANAGER/OWNER can approve
    if (user.role !== 'MANAGER' && user.role !== 'OWNER') {
      return c.json({ error: 'Only Manager/Owner can approve transfers' }, 403);
    }

    const id = c.req.param('id');

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        productVariant: {
          include: {
            product: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!transfer) {
      return c.json({ error: 'Transfer not found' }, 404);
    }

    if (transfer.status !== 'PENDING') {
      return c.json({ error: 'Transfer already processed' }, 400);
    }

    // Check stock availability
    const sourceStock = await prisma.stock.findUnique({
      where: {
        productVariantId_cabangId: {
          productVariantId: transfer.variantId,
          cabangId: transfer.fromCabangId
        }
      }
    });

    if (!sourceStock || sourceStock.quantity < transfer.quantity) {
      return c.json({ 
        error: `Insufficient stock. Available: ${sourceStock?.quantity || 0}` 
      }, 400);
    }

    // Approve and update stock
    const result = await prisma.$transaction(async (tx) => {
      // Deduct from source
      await tx.stock.update({
        where: {
          productVariantId_cabangId: {
            productVariantId: transfer.variantId,
            cabangId: transfer.fromCabangId
          }
        },
        data: { quantity: { decrement: transfer.quantity } }
      });

      // Add to destination
      await tx.stock.upsert({
        where: {
          productVariantId_cabangId: {
            productVariantId: transfer.variantId,
            cabangId: transfer.toCabangId
          }
        },
        update: { quantity: { increment: transfer.quantity } },
        create: {
          productVariantId: transfer.variantId,
          cabangId: transfer.toCabangId,
          quantity: transfer.quantity,
          price: sourceStock.price
        }
      });

      // Update transfer status
      return await tx.stockTransfer.update({
        where: { id },
        data: { status: 'COMPLETED' },
        include: {
          productVariant: {
            include: {
              product: { select: { id: true, name: true } }
            }
          },
          fromCabang: { select: { id: true, name: true } },
          toCabang: { select: { id: true, name: true } },
          transferredBy: { select: { id: true, name: true, email: true, role: true } }
        }
      });
    });

    // Emit socket event
    emitStockUpdated({
      type: 'transfer',
      transferId: result.id,
      fromCabangId: transfer.fromCabangId,
      toCabangId: transfer.toCabangId,
      variantId: transfer.variantId,
      quantity: transfer.quantity
    });

    return c.json(result);
  } catch (error) {
    console.error('Approve transfer error:', error);
    return c.json({ error: 'Failed to approve transfer' }, 500);
  }
});

// Reject/Cancel transfer (MANAGER/OWNER only, or ADMIN for their own pending)
stockTransfers.patch('/:id/reject', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const { reason } = body as { reason?: string };

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id }
    });

    if (!transfer) {
      return c.json({ error: 'Transfer not found' }, 404);
    }

    if (transfer.status !== 'PENDING') {
      return c.json({ error: 'Transfer already processed' }, 400);
    }

    // ADMIN can only cancel their own transfers
    // MANAGER/OWNER can cancel any
    if (user.role === 'ADMIN' && transfer.transferredById !== user.userId) {
      return c.json({ error: 'You can only cancel your own transfer requests' }, 403);
    }

    const result = await prisma.stockTransfer.update({
      where: { id },
      data: { 
        status: 'CANCELLED',
        notes: reason ? `${transfer.notes || ''} [CANCELLED: ${reason}]`.trim() : transfer.notes
      },
      include: {
        productVariant: {
          include: {
            product: { select: { id: true, name: true } }
          }
        },
        fromCabang: { select: { id: true, name: true } },
        toCabang: { select: { id: true, name: true } },
        transferredBy: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    return c.json(result);
  } catch (error) {
    console.error('Reject transfer error:', error);
    return c.json({ error: 'Failed to reject transfer' }, 500);
  }
});

// Get all stock transfers
stockTransfers.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Only ADMIN, MANAGER, OWNER can view transfers
    if (user.role === 'KASIR') {
      return c.json({ error: 'Access denied' }, 403);
    }

    const cabangId = c.req.query('cabangId');
    const variantId = c.req.query('variantId');
    const status = c.req.query('status');

    // Build filter
    const where: any = {};
    
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

    return c.json(transfers);
  } catch (error) {
    console.error('Get stock transfers error:', error);
    return c.json({ error: 'Failed to fetch stock transfers' }, 500);
  }
});

// Get single transfer
stockTransfers.get('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Only ADMIN, MANAGER, OWNER can view transfers
    if (user.role === 'KASIR') {
      return c.json({ error: 'Access denied' }, 403);
    }

    const id = c.req.param('id');

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
      return c.json({ error: 'Transfer not found' }, 404);
    }

    return c.json(transfer);
  } catch (error) {
    console.error('Get transfer error:', error);
    return c.json({ error: 'Failed to fetch transfer' }, 500);
  }
});

// Get transfer statistics
stockTransfers.get('/stats/summary', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Only ADMIN, MANAGER, OWNER can view stats
    if (user.role === 'KASIR') {
      return c.json({ error: 'Access denied' }, 403);
    }

    const cabangId = c.req.query('cabangId');

    let where: any = {};
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

    return c.json({
      total,
      completed,
      pending,
      totalQuantity
    });
  } catch (error) {
    console.error('Get transfer stats error:', error);
    return c.json({ error: 'Failed to fetch transfer statistics' }, 500);
  }
});

export default stockTransfers;
