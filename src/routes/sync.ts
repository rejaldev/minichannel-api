import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';

const sync = new Hono();

// Health check endpoint
sync.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'AnekaBuana API'
  });
});

// Delta sync - Get products updated after timestamp
sync.get('/products/delta', authMiddleware, async (c) => {
  try {
    const updatedAfter = c.req.query('updatedAfter');

    if (!updatedAfter) {
      return c.json({ error: 'updatedAfter parameter is required' }, 400);
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
    const categoryIds = [...new Set(products.map(p => p.categoryId).filter(Boolean))] as string[];
    const categories = await prisma.category.findMany({
      where: {
        id: {
          in: categoryIds
        }
      }
    });

    return c.json({
      count: products.length,
      products,
      categories,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delta sync error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Batch transaction sync - Accept multiple transactions at once
sync.post('/transactions/batch', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { transactions } = body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return c.json({ error: 'transactions array is required' }, 400);
    }

    const results: Array<{ localId: string; serverId: string; status: string }> = [];
    const errors: Array<{ transaction: unknown; error: string }> = [];
    const user = c.get('user');

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

          // Check if transaction already exists (by ID or transactionNo)
          const existingTransaction = await tx.transaction.findFirst({
            where: {
              OR: [
                { id: txData.id },
                { transactionNo: txData.transactionNo }
              ]
            }
          });

          // If transaction already exists, skip creation and return existing
          if (existingTransaction) {
            console.log(`[Sync] Transaction ${txData.transactionNo} already exists, skipping...`);
            return existingTransaction;
          }

          // Create transaction (use offline createdAt if provided, use kasirId from request)
          const newTransaction = await tx.transaction.create({
            data: {
              id: txData.id, // Preserve offline ID
              transactionNo: txData.transactionNo || `INV-${Date.now()}`,
              cabangId,
              kasirId: kasirId || user.userId, // Use kasirId from offline transaction, fallback to user.userId
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
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return c.json({
      success: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    console.error('Batch transaction error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default sync;
