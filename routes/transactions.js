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
      // Split Payment
      isSplitPayment = false,
      paymentAmount1,
      paymentMethod2,
      paymentAmount2,
      bankName2,
      referenceNo2,
      notes 
    } = req.body;

    // Get cabangId from authenticated user's token
    const cabangId = req.user.cabangId;

    // Validation
    if (!cabangId) {
      return res.status(400).json({ 
        error: 'User must be assigned to a cabang' 
      });
    }

    if (!items || items.length === 0 || !paymentMethod) {
      return res.status(400).json({ 
        error: 'items and paymentMethod are required' 
      });
    }

    if (!['CASH', 'DEBIT', 'TRANSFER', 'QRIS'].includes(paymentMethod)) {
      return res.status(400).json({ 
        error: 'Invalid payment method. Must be CASH, DEBIT, TRANSFER, or QRIS' 
      });
    }

    // Split Payment Validation
    if (isSplitPayment) {
      if (!paymentMethod2 || !paymentAmount1 || !paymentAmount2) {
        return res.status(400).json({ 
          error: 'Split payment requires paymentMethod2, paymentAmount1, and paymentAmount2' 
        });
      }

      if (!['CASH', 'DEBIT', 'TRANSFER', 'QRIS'].includes(paymentMethod2)) {
        return res.status(400).json({ 
          error: 'Invalid payment method 2. Must be CASH, DEBIT, TRANSFER, or QRIS' 
        });
      }

      if (paymentMethod === paymentMethod2) {
        return res.status(400).json({ 
          error: 'Payment methods must be different for split payment' 
        });
      }
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

    // Validate split payment amounts match total
    if (isSplitPayment) {
      const sumPayments = paymentAmount1 + paymentAmount2;
      if (Math.abs(sumPayments - total) > 0.01) { // Allow 0.01 difference for rounding
        return res.status(400).json({ 
          error: `Split payment amounts (${sumPayments}) must equal total (${total})` 
        });
      }
    }

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
          // Split Payment
          isSplitPayment: isSplitPayment || false,
          paymentAmount1: isSplitPayment ? paymentAmount1 : null,
          paymentMethod2: isSplitPayment ? paymentMethod2 : null,
          paymentAmount2: isSplitPayment ? paymentAmount2 : null,
          bankName2: isSplitPayment ? (bankName2 || null) : null,
          referenceNo2: isSplitPayment ? (referenceNo2 || null) : null,
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

// Get sales trend (daily for last 7 days or last 30 days)
router.get('/reports/sales-trend', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { cabangId, days = 7 } = req.query;
    const daysCount = parseInt(days);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysCount);
    startDate.setHours(0, 0, 0, 0);

    const where = {
      createdAt: { gte: startDate }
    };
    if (cabangId) where.cabangId = cabangId;

    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        createdAt: true,
        total: true
      }
    });

    // Group by date
    const salesByDate = {};
    for (let i = 0; i < daysCount; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      salesByDate[dateKey] = { date: dateKey, total: 0, count: 0 };
    }

    transactions.forEach(t => {
      const dateKey = t.createdAt.toISOString().split('T')[0];
      if (salesByDate[dateKey]) {
        salesByDate[dateKey].total += t.total;
        salesByDate[dateKey].count += 1;
      }
    });

    const trend = Object.values(salesByDate).reverse();

    res.json({ trend });
  } catch (error) {
    console.error('Get sales trend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top selling products
router.get('/reports/top-products', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { cabangId, limit = 10, startDate, endDate } = req.query;

    const where = {};
    if (cabangId) where.transaction = { cabangId };
    if (startDate || endDate) {
      where.transaction = { ...where.transaction, createdAt: {} };
      if (startDate) where.transaction.createdAt.gte = new Date(startDate);
      if (endDate) where.transaction.createdAt.lte = new Date(endDate);
    }

    const topProducts = await prisma.transactionItem.groupBy({
      by: ['productVariantId'],
      where,
      _sum: {
        quantity: true,
        subtotal: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: parseInt(limit)
    });

    // Get product details
    const productsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const variant = await prisma.productVariant.findUnique({
          where: { id: item.productVariantId },
          include: {
            product: {
              select: {
                name: true,
                category: { select: { name: true } }
              }
            }
          }
        });

        return {
          productVariantId: item.productVariantId,
          productName: variant?.product.name || 'Unknown',
          variantName: variant?.variantName || '-',
          variantValue: variant?.variantValue || '-',
          category: variant?.product.category?.name || '-',
          totalQuantity: item._sum.quantity,
          totalRevenue: item._sum.subtotal,
          transactionCount: item._count.id
        };
      })
    );

    res.json({ topProducts: productsWithDetails });
  } catch (error) {
    console.error('Get top products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get branch performance comparison
router.get('/reports/branch-performance', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const branchStats = await prisma.transaction.groupBy({
      by: ['cabangId'],
      where,
      _count: { id: true },
      _sum: { total: true },
      _avg: { total: true }
    });

    // Get cabang details
    const branchPerformance = await Promise.all(
      branchStats.map(async (stat) => {
        const cabang = await prisma.cabang.findUnique({
          where: { id: stat.cabangId }
        });

        return {
          cabangId: stat.cabangId,
          cabangName: cabang?.name || 'Unknown',
          totalTransactions: stat._count.id,
          totalRevenue: stat._sum.total || 0,
          avgTransactionValue: Math.round(stat._avg.total || 0)
        };
      })
    );

    // Sort by revenue
    branchPerformance.sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({ branchPerformance });
  } catch (error) {
    console.error('Get branch performance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get time statistics (busiest hours/days)
router.get('/reports/time-stats', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { cabangId, startDate, endDate } = req.query;

    const where = {};
    if (cabangId) where.cabangId = cabangId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        createdAt: true,
        total: true
      }
    });

    // Group by hour (0-23)
    const hourlyStats = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0, total: 0 }));
    
    // Group by day of week (0=Sunday, 6=Saturday)
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dailyStats = Array(7).fill(0).map((_, i) => ({ 
      day: dayNames[i], 
      dayIndex: i, 
      count: 0, 
      total: 0 
    }));

    transactions.forEach(t => {
      const hour = t.createdAt.getHours();
      const day = t.createdAt.getDay();
      
      hourlyStats[hour].count += 1;
      hourlyStats[hour].total += t.total;
      
      dailyStats[day].count += 1;
      dailyStats[day].total += t.total;
    });

    // Find busiest hour and day
    const busiestHour = hourlyStats.reduce((max, curr) => 
      curr.count > max.count ? curr : max
    );
    
    const busiestDay = dailyStats.reduce((max, curr) => 
      curr.count > max.count ? curr : max
    );

    res.json({ 
      hourlyStats: hourlyStats.filter(h => h.count > 0),
      dailyStats,
      busiestHour: {
        hour: busiestHour.hour,
        count: busiestHour.count,
        total: busiestHour.total
      },
      busiestDay: {
        day: busiestDay.day,
        count: busiestDay.count,
        total: busiestDay.total
      }
    });
  } catch (error) {
    console.error('Get time stats error:', error);
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
