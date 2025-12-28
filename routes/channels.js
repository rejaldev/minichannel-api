const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware, ownerOnly, ownerOrManager } = require('../middleware/auth');

// GET /api/channels - Get all sales channels
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { includeInactive } = req.query;
    
    const where = {};
    if (!includeInactive) {
      where.isActive = true;
    }
    
    const channels = await prisma.salesChannel.findMany({
      where,
      orderBy: [
        { isBuiltIn: 'desc' },
        { name: 'asc' }
      ]
    });
    
    res.json(channels);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /api/channels/:id - Get channel by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const channel = await prisma.salesChannel.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true, channelStocks: true }
        }
      }
    });
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    res.json(channel);
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// POST /api/channels - Create new channel (OWNER/MANAGER only)
router.post('/', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { code, name, type, icon, color, apiConfig, fieldMapping } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }
    
    // Check if code already exists
    const existing = await prisma.salesChannel.findUnique({
      where: { code: code.toUpperCase() }
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Channel code already exists' });
    }
    
    const channel = await prisma.salesChannel.create({
      data: {
        code: code.toUpperCase(),
        name,
        type: type || 'MARKETPLACE',
        icon,
        color,
        apiConfig: apiConfig || null,
        fieldMapping: fieldMapping || null,
        isBuiltIn: false
      }
    });
    
    res.status(201).json(channel);
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// PUT /api/channels/:id - Update channel
router.put('/:id', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, icon, color, isActive, apiConfig, fieldMapping } = req.body;
    
    const channel = await prisma.salesChannel.findUnique({ where: { id } });
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Cannot modify built-in channel's code
    const updateData = {
      name: name || channel.name,
      type: type || channel.type,
      icon: icon !== undefined ? icon : channel.icon,
      color: color !== undefined ? color : channel.color,
      isActive: isActive !== undefined ? isActive : channel.isActive,
      apiConfig: apiConfig !== undefined ? apiConfig : channel.apiConfig,
      fieldMapping: fieldMapping !== undefined ? fieldMapping : channel.fieldMapping
    };
    
    const updated = await prisma.salesChannel.update({
      where: { id },
      data: updateData
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// DELETE /api/channels/:id - Delete channel (soft delete by setting isActive = false)
router.delete('/:id', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    const channel = await prisma.salesChannel.findUnique({ where: { id } });
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    if (channel.isBuiltIn) {
      return res.status(400).json({ error: 'Cannot delete built-in channel' });
    }
    
    // Check if channel has transactions
    const txCount = await prisma.transaction.count({
      where: { channelId: id }
    });
    
    if (txCount > 0) {
      // Soft delete
      await prisma.salesChannel.update({
        where: { id },
        data: { isActive: false }
      });
      res.json({ message: 'Channel deactivated (has transactions)' });
    } else {
      // Hard delete
      await prisma.salesChannel.delete({ where: { id } });
      res.json({ message: 'Channel deleted' });
    }
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// ==================== CHANNEL STOCK ALLOCATION ====================

// GET /api/channels/:channelId/stocks - Get stock allocation for a channel
router.get('/:channelId/stocks', authMiddleware, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { productId, search } = req.query;
    
    const where = { channelId };
    
    const stocks = await prisma.channelStock.findMany({
      where,
      include: {
        productVariant: {
          include: {
            product: {
              select: { id: true, name: true, category: { select: { name: true } } }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    
    // Filter by product name/sku if search provided
    let filtered = stocks;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = stocks.filter(s => 
        s.productVariant.product.name.toLowerCase().includes(searchLower) ||
        s.productVariant.sku.toLowerCase().includes(searchLower)
      );
    }
    
    if (productId) {
      filtered = filtered.filter(s => s.productVariant.productId === productId);
    }
    
    res.json(filtered);
  } catch (error) {
    console.error('Error fetching channel stocks:', error);
    res.status(500).json({ error: 'Failed to fetch channel stocks' });
  }
});

// POST /api/channels/:channelId/stocks - Allocate stock to channel
router.post('/:channelId/stocks', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { variantId, allocatedQty } = req.body;
    
    if (!variantId || allocatedQty === undefined) {
      return res.status(400).json({ error: 'variantId and allocatedQty are required' });
    }
    
    // Check channel exists
    const channel = await prisma.salesChannel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Upsert channel stock
    const channelStock = await prisma.channelStock.upsert({
      where: {
        channelId_productVariantId: {
          channelId,
          productVariantId: variantId
        }
      },
      update: {
        allocatedQty: allocatedQty
      },
      create: {
        channelId,
        productVariantId: variantId,
        allocatedQty
      },
      include: {
        productVariant: {
          include: {
            product: { select: { name: true } }
          }
        }
      }
    });
    
    res.json(channelStock);
  } catch (error) {
    console.error('Error allocating channel stock:', error);
    res.status(500).json({ error: 'Failed to allocate channel stock' });
  }
});

// PUT /api/channels/:channelId/stocks/:variantId - Update stock allocation
router.put('/:channelId/stocks/:variantId', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { channelId, variantId } = req.params;
    const { allocatedQty, reservedQty, isActive } = req.body;
    
    const updated = await prisma.channelStock.update({
      where: {
        channelId_productVariantId: {
          channelId,
          productVariantId: variantId
        }
      },
      data: {
        ...(allocatedQty !== undefined && { allocatedQty }),
        ...(reservedQty !== undefined && { reservedQty }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        productVariant: {
          include: {
            product: { select: { name: true } }
          }
        }
      }
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating channel stock:', error);
    res.status(500).json({ error: 'Failed to update channel stock' });
  }
});

// POST /api/channels/:channelId/stocks/bulk - Bulk allocate stocks
router.post('/:channelId/stocks/bulk', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { allocations } = req.body; // [{ variantId, allocatedQty }, ...]
    
    if (!allocations || !Array.isArray(allocations)) {
      return res.status(400).json({ error: 'allocations array is required' });
    }
    
    const results = await prisma.$transaction(
      allocations.map(({ variantId, allocatedQty }) =>
        prisma.channelStock.upsert({
          where: {
            channelId_productVariantId: {
              channelId,
              productVariantId: variantId
            }
          },
          update: { allocatedQty },
          create: {
            channelId,
            productVariantId: variantId,
            allocatedQty
          }
        })
      )
    );
    
    res.json({ message: `${results.length} stocks allocated`, data: results });
  } catch (error) {
    console.error('Error bulk allocating stocks:', error);
    res.status(500).json({ error: 'Failed to bulk allocate stocks' });
  }
});

// GET /api/channels/stats/summary - Get channel statistics
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    
    const channels = await prisma.salesChannel.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });
    
    // Get transaction stats per channel
    const stats = await Promise.all(
      channels.map(async (channel) => {
        const where = { channelId: channel.id };
        if (startDate || endDate) {
          where.createdAt = dateFilter;
        }
        
        const transactions = await prisma.transaction.aggregate({
          where,
          _count: true,
          _sum: { total: true }
        });
        
        return {
          id: channel.id,
          code: channel.code,
          name: channel.name,
          type: channel.type,
          icon: channel.icon,
          color: channel.color,
          transactionCount: transactions._count || 0,
          totalRevenue: transactions._sum.total || 0
        };
      })
    );
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching channel stats:', error);
    res.status(500).json({ error: 'Failed to fetch channel stats' });
  }
});

module.exports = router;
