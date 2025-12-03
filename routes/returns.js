const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authMiddleware } = require('../middleware/auth');

// GET /api/returns/stats - Get return statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { cabangId } = req.query;
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
    
    res.json({
      pending,
      rejected,
      completed,
      total: pending + rejected + completed,
      totalRefundAmount: totalRefund._sum.refundAmount || 0
    });
  } catch (error) {
    console.error('Error fetching return stats:', error);
    res.status(500).json({ error: 'Failed to fetch return statistics' });
  }
});

// GET /api/returns - Get all returns with pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { cabangId, status, startDate, endDate, search, page = 1, limit = 10 } = req.query;

    const where = {};
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
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [returns, total] = await Promise.all([
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

    res.json({
      returns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Failed to fetch returns' });
  }
});

// GET /api/returns/:id - Get return detail
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

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
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ return: returnData });
  } catch (error) {
    console.error('Error fetching return:', error);
    res.status(500).json({ error: 'Failed to fetch return' });
  }
});

// POST /api/returns - Create new return
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      transactionId,
      reason,
      notes,
      items, // [{ productVariantId, quantity, price }]
      refundMethod,
      approvedBy, // Manager user ID
    } = req.body;

    // Validation
    if (!transactionId || !reason || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        items: true,
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Validate items
    for (const item of items) {
      const transactionItem = transaction.items.find(
        (ti) => ti.productVariantId === item.productVariantId
      );
      if (!transactionItem) {
        return res.status(400).json({
          error: `Product variant ${item.productVariantId} not found in transaction`,
        });
      }
      if (item.quantity > transactionItem.quantity) {
        return res.status(400).json({
          error: `Return quantity exceeds transaction quantity for ${transactionItem.productName}`,
        });
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

    let returnNo;
    if (lastReturn) {
      const lastNumber = parseInt(lastReturn.returnNo.split('-').pop());
      returnNo = `RET-${dateStr}-${String(lastNumber + 1).padStart(4, '0')}`;
    } else {
      returnNo = `RET-${dateStr}-0001`;
    }

    // Create return
    const returnData = await prisma.$transaction(async (tx) => {
      // Use cabangId from user if available, otherwise use transaction's cabangId
      const returnCabangId = req.user.cabangId || transaction.cabangId;
      
      if (!returnCabangId) {
        throw new Error('Cannot determine cabang for return. Transaction has no cabangId.');
      }
      
      const newReturn = await tx.return.create({
        data: {
          returnNo,
          transactionId,
          cabangId: returnCabangId,
          processedById: req.user.userId,
          reason,
          notes,
          subtotal,
          refundMethod: refundMethod || transaction.paymentMethod,
          refundAmount,
          status: approvedBy ? 'APPROVED' : 'PENDING',
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
                  productName: transactionItem.productName,
                  variantInfo: transactionItem.variantInfo,
                  sku: transactionItem.sku,
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
      if (approvedBy) {
        for (const item of items) {
          await tx.stock.update({
            where: {
              productVariantId_cabangId: {
                productVariantId: item.productVariantId,
                cabangId: req.user.cabangId,
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

    res.status(201).json({ return: returnData });
  } catch (error) {
    console.error('Error creating return:', error);
    res.status(500).json({ error: 'Failed to create return' });
  }
});

// PATCH /api/returns/:id/approve - Approve return
router.patch('/:id/approve', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body; // Manager user ID

    if (!approvedBy) {
      return res.status(400).json({ error: 'Manager approval required' });
    }

    const returnData = await prisma.return.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!returnData) {
      return res.status(404).json({ error: 'Return not found' });
    }

    if (returnData.status !== 'PENDING') {
      return res.status(400).json({ error: 'Return already processed' });
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

    res.json({ return: updatedReturn });
  } catch (error) {
    console.error('Error approving return:', error);
    res.status(500).json({ error: 'Failed to approve return' });
  }
});

// PATCH /api/returns/:id/reject - Reject return
router.patch('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectedBy, rejectionNotes } = req.body;

    const returnData = await prisma.return.findUnique({
      where: { id },
    });

    if (!returnData) {
      return res.status(404).json({ error: 'Return not found' });
    }

    if (returnData.status !== 'PENDING') {
      return res.status(400).json({ error: 'Return already processed' });
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

    res.json({ return: updatedReturn });
  } catch (error) {
    console.error('Error rejecting return:', error);
    res.status(500).json({ error: 'Failed to reject return' });
  }
});

module.exports = router;
