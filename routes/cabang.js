const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get all cabangs
router.get('/', authMiddleware, async (req, res) => {
  try {
    const cabangs = await prisma.cabang.findMany({
      include: {
        _count: {
          select: { 
            users: true,
            stocks: true,
            transactions: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    res.json(cabangs);
  } catch (error) {
    console.error('Get cabangs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single cabang
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const cabang = await prisma.cabang.findUnique({
      where: { id: req.params.id },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true }
        },
        _count: {
          select: { 
            stocks: true,
            transactions: true
          }
        }
      }
    });

    if (!cabang) {
      return res.status(404).json({ error: 'Cabang not found' });
    }

    res.json(cabang);
  } catch (error) {
    console.error('Get cabang error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create cabang (Owner only)
router.post('/', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { name, address, phone } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required' });
    }

    const cabang = await prisma.cabang.create({
      data: { name, address, phone }
    });

    res.status(201).json(cabang);
  } catch (error) {
    console.error('Create cabang error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Cabang name already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cabang (Owner only)
router.put('/:id', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { name, address, phone, isActive } = req.body;

    const cabang = await prisma.cabang.update({
      where: { id: req.params.id },
      data: { name, address, phone, isActive }
    });

    res.json(cabang);
  } catch (error) {
    console.error('Update cabang error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Cabang not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
