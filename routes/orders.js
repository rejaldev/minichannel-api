const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

// Generate order number
function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD-${dateStr}-${random}`;
}

// Create order request (KASIR)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { productName, productType, categoryId, categoryName, price, quantity, notes } = req.body;
    
    // Validation
    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    // Get user's cabangId from token
    const cabangId = req.user.cabangId;
    if (!cabangId) {
      return res.status(400).json({ error: 'User must be assigned to a cabang' });
    }

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNo: generateOrderNo(),
        requestedById: req.user.userId,
        cabangId,
        productName,
        productType: productType || 'SINGLE',
        categoryId: categoryId || null,
        categoryName: categoryName || null,
        price: price ? parseFloat(price) : null,
        quantity: quantity ? parseInt(quantity) : null,
        notes: notes || null,
        status: 'PENDING',
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        cabang: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get all orders (ADMIN, MANAGER, OWNER)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, cabangId } = req.query;

    // Build filter
    const where = {};
    
    if (status) {
      where.status = status;
    }

    // KASIR can only see their own orders
    if (req.user.role === 'KASIR') {
      where.requestedById = req.user.userId;
    }
    // Other roles can filter by cabang
    else if (cabangId) {
      where.cabangId = cabangId;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        cabang: {
          select: { id: true, name: true }
        },
        processedBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        productVariant: {
          include: {
            product: {
              select: { id: true, name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        cabang: {
          select: { id: true, name: true }
        },
        processedBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        productVariant: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // KASIR can only view their own orders
    if (req.user.role === 'KASIR' && order.requestedById !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Process order - Approve (ADMIN only)
router.put('/:id/approve', authMiddleware, async (req, res) => {
  try {
    // Only ADMIN can approve orders
    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only ADMIN can approve orders' });
    }

    const { id } = req.params;
    const { productId, variantId } = req.body;

    // Get order
    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Order already processed' });
    }

    // Update order
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'APPROVED',
        processedById: req.user.userId,
        processedAt: new Date(),
        productVariantId: variantId || null
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true }
        },
        cabang: {
          select: { id: true, name: true }
        },
        processedBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Approve order error:', error);
    res.status(500).json({ error: 'Failed to approve order' });
  }
});

// Process order - Reject (ADMIN only)
router.put('/:id/reject', authMiddleware, async (req, res) => {
  try {
    // Only ADMIN can reject orders
    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only ADMIN can reject orders' });
    }

    const { id } = req.params;
    const { rejectionReason } = req.body;

    // Get order
    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Order already processed' });
    }

    // Update order
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason || 'No reason provided',
        processedById: req.user.userId,
        processedAt: new Date()
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true }
        },
        cabang: {
          select: { id: true, name: true }
        },
        processedBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Reject order error:', error);
    res.status(500).json({ error: 'Failed to reject order' });
  }
});

// Delete order (ADMIN or requester)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only requester or ADMIN/OWNER can delete
    if (order.requestedById !== req.user.userId && 
        req.user.role !== 'ADMIN' && 
        req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only delete PENDING orders
    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Can only delete pending orders' });
    }

    await prisma.order.delete({
      where: { id }
    });

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Get order statistics
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    // Only ADMIN, MANAGER, OWNER can view stats
    if (req.user.role === 'KASIR') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [pending, approved, rejected, total] = await Promise.all([
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'APPROVED' } }),
      prisma.order.count({ where: { status: 'REJECTED' } }),
      prisma.order.count()
    ]);

    res.json({
      pending,
      approved,
      rejected,
      total
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

module.exports = router;
