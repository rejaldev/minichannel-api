const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'AnekaBuana API'
  });
});

// Delta sync - Get products updated after timestamp
router.get('/products/delta', authMiddleware, async (req, res) => {
  try {
    const { updatedAfter } = req.query;

    if (!updatedAfter) {
      return res.status(400).json({ error: 'updatedAfter parameter is required' });
    }

    const products = await prisma.product.findMany({
      where: {
        updatedAt: {
          gt: new Date(updatedAfter)
        }
      },
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: {
                cabang: true
              }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Get unique categories from products
    const categoryIds = [...new Set(products.map(p => p.categoryId).filter(Boolean))];
    const categories = await prisma.category.findMany({
      where: {
        id: {
          in: categoryIds
        }
      }
    });

    res.json({
      count: products.length,
      products,
      categories,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delta sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch transaction sync - Accept multiple transactions at once
router.post('/transactions/batch', authMiddleware, async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'transactions array is required' });
    }

    const results = [];
    const errors = [];

    // Process each transaction
    for (const txData of transactions) {
      try {
        const { 
          cabangId, 
          kasirId, 
          kasirName,
          customerName, 
          customerPhone, 
          items, 
          discount, 
          paymentMethod, 
          bankName, 
          referenceNo,
          // Split Payment
          isSplitPayment,
          paymentAmount1,
          paymentMethod2,
          paymentAmount2,
          bankName2,
          referenceNo2,
          notes, 
          createdAt 
        } = txData;

        if (!cabangId || !items || items.length === 0 || !paymentMethod) {
          errors.push({
            transaction: txData,
            error: 'Missing required fields'
          });
          continue;
        }

        // Create transaction with offline timestamp
        const transaction = await prisma.$transaction(async (tx) => {
          // Calculate totals
          let subtotal = 0;
          for (const item of items) {
            subtotal += item.price * item.quantity;
          }
          const total = subtotal - (discount || 0);

          // Create transaction (use offline createdAt if provided, use kasirId from request)
          const newTransaction = await tx.transaction.create({
            data: {
              transactionNo: txData.transactionNo || `INV-${Date.now()}`,
              cabangId,
              kasirId: kasirId || req.user.id, // Use kasirId from offline transaction, fallback to req.user.id
              customerName,
              customerPhone,
              subtotal,
              discount: discount || 0,
              tax: 0,
              total,
              paymentMethod,
              paymentStatus: 'COMPLETED',
              bankName,
              referenceNo,
              // Split Payment
              isSplitPayment: isSplitPayment || false,
              paymentAmount1: isSplitPayment ? paymentAmount1 : null,
              paymentMethod2: isSplitPayment ? paymentMethod2 : null,
              paymentAmount2: isSplitPayment ? paymentAmount2 : null,
              bankName2: isSplitPayment ? (bankName2 || null) : null,
              referenceNo2: isSplitPayment ? (referenceNo2 || null) : null,
              notes,
              createdAt: createdAt ? new Date(createdAt) : undefined // Honor offline timestamp
            }
          });

          // Create transaction items and update stock
          for (const item of items) {
            await tx.transactionItem.create({
              data: {
                transactionId: newTransaction.id,
                productVariantId: item.productVariantId,
                productName: item.productName,
                variantInfo: item.variantInfo,
                sku: item.sku,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.price * item.quantity
              }
            });

            // Deduct stock
            const stock = await tx.stock.findUnique({
              where: {
                productVariantId_cabangId: {
                  productVariantId: item.productVariantId,
                  cabangId
                }
              }
            });

            if (stock) {
              await tx.stock.update({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: item.productVariantId,
                    cabangId
                  }
                },
                data: {
                  quantity: {
                    decrement: item.quantity
                  }
                }
              });
            }
          }

          return newTransaction;
        });

        results.push({
          localId: txData.id,
          serverId: transaction.id,
          status: 'success'
        });

      } catch (error) {
        console.error('Batch transaction item error:', error);
        errors.push({
          transaction: txData,
          error: error.message
        });
      }
    }

    res.json({
      success: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    console.error('Batch transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
