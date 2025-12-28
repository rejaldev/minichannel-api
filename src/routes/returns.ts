import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { authMiddleware, type AuthUser } from '../middleware/auth';

type Variables = {
  user: AuthUser;
};

interface ReturnItem {
  productVariantId: string;
  quantity: number;
  price: number;
}

const returns = new Hono<{ Variables: Variables }>();

// GET /api/returns/stats - Get return statistics
returns.get('/stats', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const where = cabangId ? { cabangId } : {};
    
    const [pending, rejected, completed, totalRefund] = await Promise.all([
      prisma.return.count({ where: { ...where, status: 'PENDING' } }),
      prisma.return.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.return.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.return.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: { refundAmount: true }
      })
    ]);
    
    return c.json({
      pending,
      rejected,
      completed,
      total: pending + rejected + completed,
      totalRefundAmount: totalRefund._sum.refundAmount || 0
    });
  } catch (error) {
    console.error('Error fetching return stats:', error);
    return c.json({ error: 'Failed to fetch return statistics' }, 500);
  }
});

// GET /api/returns - Get all returns with pagination
returns.get('/', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const status = c.req.query('status');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const search = c.req.query('search');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');

    const where: any = {};
    if (cabangId) where.cabangId = cabangId;
    if (status && status !== 'ALL') where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateTime;
      }
    }

    // Search by return no or transaction no
    if (search) {
      where.OR = [
        { returnNo: { contains: search, mode: 'insensitive' } },
        { transaction: { transactionNo: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // Pagination
    const skip = (page - 1) * limit;
    const take = limit;

    const [returnsData, total] = await Promise.all([
      prisma.return.findMany({
        where,
        skip,
        take,
        include: {
          transaction: {
            select: {
              transactionNo: true,
              customerName: true,
              customerPhone: true,
              paymentMethod: true,
              total: true,
              createdAt: true,
            },
          },
          cabang: {
            select: {
              id: true,
              name: true,
            },
          },
          processedBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          items: {
            include: {
              productVariant: {
                include: {
                  product: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.return.count({ where })
    ]);

    return c.json({
      returns: returnsData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching returns:', error);
    return c.json({ error: 'Failed to fetch returns' }, 500);
  }
});

// GET /api/returns/:id - Get return detail
returns.get('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');

    const returnData = await prisma.return.findUnique({
      where: { id },
      include: {
        transaction: {
          select: {
            transactionNo: true,
            customerName: true,
            customerPhone: true,
            paymentMethod: true,
            total: true,
          },
        },
        processedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!returnData) {
      return c.json({ error: 'Return not found' }, 404);
    }

    return c.json({ return: returnData });
  } catch (error) {
    console.error('Error fetching return:', error);
    return c.json({ error: 'Failed to fetch return' }, 500);
  }
});

// POST /api/returns - Create new return
returns.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const {
      transactionId,
      reason,
      notes,
      items,
      refundMethod,
      approvedBy,
    } = body as {
      transactionId: string;
      reason: string;
      notes?: string;
      items: ReturnItem[];
      refundMethod?: string;
      approvedBy?: string;
    };

    const user = c.get('user');

    // Validation
    if (!transactionId || !reason || !items || items.length === 0) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        items: true,
      },
    });

    if (!transaction) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    // Validate items
    for (const item of items) {
      const transactionItem = transaction.items.find(
        (ti) => ti.productVariantId === item.productVariantId
      );
      if (!transactionItem) {
        return c.json({
          error: `Product variant ${item.productVariantId} not found in transaction`,
        }, 400);
      }
      if (item.quantity > transactionItem.quantity) {
        return c.json({
          error: `Return quantity exceeds transaction quantity for ${transactionItem.productName}`,
        }, 400);
      }
    }

    // Calculate total
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const refundAmount = subtotal;

    // Generate return number
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const lastReturn = await prisma.return.findFirst({
      where: {
        returnNo: {
          startsWith: `RET-${dateStr}`,
        },
      },
      orderBy: {
        returnNo: 'desc',
      },
    });

    let returnNo: string;
    if (lastReturn) {
      const lastNumber = parseInt(lastReturn.returnNo.split('-').pop() || '0');
      returnNo = `RET-${dateStr}-${String(lastNumber + 1).padStart(4, '0')}`;
    } else {
      returnNo = `RET-${dateStr}-0001`;
    }

    // Create return
    const returnData = await prisma.$transaction(async (tx) => {
      // Use cabangId from user if available, otherwise use transaction's cabangId
      const returnCabangId = user.cabangId || transaction.cabangId;
      
      if (!returnCabangId) {
        throw new Error('Cannot determine cabang for return. Transaction has no cabangId.');
      }
      
      const newReturn = await tx.return.create({
        data: {
          returnNo,
          transactionId,
          cabangId: returnCabangId,
          processedById: user.userId,
          reason: reason as any,
          notes,
          subtotal,
          refundMethod: (refundMethod || transaction.paymentMethod || 'CASH') as any,
          refundAmount,
          status: approvedBy ? 'COMPLETED' : 'PENDING',
          approvedBy,
          approvedAt: approvedBy ? new Date() : null,
          items: {
            create: await Promise.all(
              items.map(async (item) => {
                const transactionItem = transaction.items.find(
                  (ti) => ti.productVariantId === item.productVariantId
                );
                return {
                  productVariantId: item.productVariantId,
                  productName: transactionItem!.productName,
                  variantInfo: transactionItem!.variantInfo,
                  sku: transactionItem!.sku,
                  quantity: item.quantity,
                  price: item.price,
                  subtotal: item.price * item.quantity,
                };
              })
            ),
          },
        },
        include: {
          items: true,
        },
      });

      // If approved, update stock immediately
      if (approvedBy && user.cabangId) {
        for (const item of items) {
          await tx.stock.update({
            where: {
              productVariantId_cabangId: {
                productVariantId: item.productVariantId,
                cabangId: user.cabangId,
              },
            },
            data: {
              quantity: {
                increment: item.quantity,
              },
            },
          });
        }

        // Update return status to COMPLETED
        await tx.return.update({
          where: { id: newReturn.id },
          data: { status: 'COMPLETED' },
        });
      }

      return newReturn;
    });

    return c.json({ return: returnData }, 201);
  } catch (error) {
    console.error('Error creating return:', error);
    return c.json({ error: 'Failed to create return' }, 500);
  }
});

// PATCH /api/returns/:id/approve - Approve return
returns.patch('/:id/approve', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { approvedBy } = body as { approvedBy: string };

    if (!approvedBy) {
      return c.json({ error: 'Manager approval required' }, 400);
    }

    const returnData = await prisma.return.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!returnData) {
      return c.json({ error: 'Return not found' }, 404);
    }

    if (returnData.status !== 'PENDING') {
      return c.json({ error: 'Return already processed' }, 400);
    }

    // Approve and update stock
    const updatedReturn = await prisma.$transaction(async (tx) => {
      // Update stock
      for (const item of returnData.items) {
        await tx.stock.update({
          where: {
            productVariantId_cabangId: {
              productVariantId: item.productVariantId,
              cabangId: returnData.cabangId,
            },
          },
          data: {
            quantity: {
              increment: item.quantity,
            },
          },
        });
      }

      // Update return status
      return await tx.return.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          approvedBy,
          approvedAt: new Date(),
        },
        include: {
          items: true,
        },
      });
    });

    return c.json({ return: updatedReturn });
  } catch (error) {
    console.error('Error approving return:', error);
    return c.json({ error: 'Failed to approve return' }, 500);
  }
});

// PATCH /api/returns/:id/reject - Reject return
returns.patch('/:id/reject', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { rejectedBy, rejectionNotes } = body as { rejectedBy: string; rejectionNotes?: string };

    const returnData = await prisma.return.findUnique({
      where: { id },
    });

    if (!returnData) {
      return c.json({ error: 'Return not found' }, 404);
    }

    if (returnData.status !== 'PENDING') {
      return c.json({ error: 'Return already processed' }, 400);
    }

    const updatedReturn = await prisma.return.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: rejectedBy,
        approvedAt: new Date(),
        notes: rejectionNotes || returnData.notes,
      },
    });

    return c.json({ return: updatedReturn });
  } catch (error) {
    console.error('Error rejecting return:', error);
    return c.json({ error: 'Failed to reject return' }, 500);
  }
});

export default returns;
