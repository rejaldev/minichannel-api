const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, ownerOrManager } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Generate transaction number (INV-YYYYMMDD-XXXX)
function generateTransactionNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `INV-${year}${month}${day}-${random}`;
}

// Create new transaction (POS)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      cabangId, 
      customerName, 
      customerPhone, 
      items, // [{ productVariantId, quantity, price }]
      discount = 0, 
      tax = 0, 
      paymentMethod,
      // Payment Details
      bankName,
      referenceNo,
      cardLastDigits,
      notes 
    } = req.body;

    // Validation
    if (!cabangId || !items || items.length === 0 || !paymentMethod) {
      return res.status(400).json({ 
        error: 'cabangId, items, and paymentMethod are required' 
      });
    }

    if (!['CASH', 'DEBIT', 'TRANSFER', 'QRIS'].includes(paymentMethod)) {
      return res.status(400).json({ 
        error: 'Invalid payment method. Must be CASH, DEBIT, TRANSFER, or QRIS' 
      });
    }

    // Calculate totals and validate stock
    let subtotal = 0;
    const itemsWithDetails = [];

    for (const item of items) {
      const { productVariantId, quantity, price } = item;

      if (!productVariantId || !quantity || !price) {
        return res.status(400).json({ 
          error: 'Each item must have productVariantId, quantity, and price' 
        });
      }

      // Get product variant with stock
      const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        include: {
          product: true,
          stocks: {
            where: { cabangId }
          }
        }
      });

      if (!variant) {
        return res.status(404).json({ 
          error: `Product variant ${productVariantId} not found` 
        });
      }

      // Check stock availability
      const stock = variant.stocks[0];
      if (!stock || stock.quantity < quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${variant.product.name} (${variant.variantName}: ${variant.variantValue})` 
        });
      }

      const itemSubtotal = price * quantity;
      subtotal += itemSubtotal;

      itemsWithDetails.push({
        productVariantId,
        productName: variant.product.name,
        variantInfo: `${variant.variantName}: ${variant.variantValue}`,
        quantity,
        price,
        subtotal: itemSubtotal,
        stockId: stock.id,
        currentStock: stock.quantity
      });
    }

    const total = subtotal - discount + tax;

    // Create transaction with items and update stock in a transaction
    const transaction = await prisma.$transaction(async (tx) => {
      // Create transaction
      const newTransaction = await tx.transaction.create({
        data: {
          transactionNo: generateTransactionNo(),
          cabangId,
          kasirId: req.user.userId,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          subtotal,
          discount,
          tax,
          total,
          paymentMethod,
          paymentStatus: 'COMPLETED',
          // Payment Details
          bankName: bankName || null,
          referenceNo: referenceNo || null,
          cardLastDigits: cardLastDigits || null,
          notes: notes || null,
          items: {
            create: itemsWithDetails.map(item => ({
              productVariantId: item.productVariantId,
              productName: item.productName,
              variantInfo: item.variantInfo,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.subtotal
            }))
          }
        },
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
          cabang: true,
          kasir: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Update stock for each item
      for (const item of itemsWithDetails) {
        await tx.stock.update({
          where: { id: item.stockId },
          data: {
            quantity: item.currentStock - item.quantity
          }
        });
      }

      return newTransaction;
    });

    res.status(201).json({
      message: 'Transaction created successfully',
      transaction
    });

  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all transactions with filters
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { cabangId, startDate, endDate, paymentMethod } = req.query;

    const where = {};
    
    // Filter by cabang (kasir can only see their branch)
    if (req.user.role === 'KASIR' && req.user.cabangId) {
      where.cabangId = req.user.cabangId;
    } else if (cabangId) {
      where.cabangId = cabangId;
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    const transactions = await prisma.transaction.findMany({
      where,
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
        cabang: true,
        kasir: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit results
    });

    res.json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single transaction by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
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
        cabang: true,
        kasir: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Kasir can only see transactions from their branch
    if (req.user.role === 'KASIR' && transaction.cabangId !== req.user.cabangId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sales summary (Owner/Manager only)
router.get('/reports/summary', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { cabangId, startDate, endDate } = req.query;

    const where = {};
    if (cabangId) where.cabangId = cabangId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [totalTransactions, totalRevenue, paymentMethodBreakdown] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.aggregate({
        where,
        _sum: { total: true }
      }),
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where,
        _count: { id: true },
        _sum: { total: true }
      })
    ]);

    res.json({
      totalTransactions,
      totalRevenue: totalRevenue._sum.total || 0,
      paymentMethodBreakdown
    });
  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel transaction (Owner only - for mistakes)
router.put('/:id/cancel', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const transactionId = req.params.id;

    // Get transaction with items
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { items: true }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.paymentStatus === 'CANCELLED') {
      return res.status(400).json({ error: 'Transaction already cancelled' });
    }

    // Update transaction and restore stock in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update transaction status
      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: { paymentStatus: 'CANCELLED' }
      });

      // Restore stock for each item
      for (const item of transaction.items) {
        const stock = await tx.stock.findUnique({
          where: {
            productVariantId_cabangId: {
              productVariantId: item.productVariantId,
              cabangId: transaction.cabangId
            }
          }
        });

        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: stock.quantity + item.quantity
            }
          });
        }
      }

      return updatedTransaction;
    });

    res.json({
      message: 'Transaction cancelled and stock restored',
      transaction: updated
    });
  } catch (error) {
    console.error('Cancel transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
