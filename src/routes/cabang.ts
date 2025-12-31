import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';

const cabang = new Hono();

// Get all cabangs
cabang.get('/', authMiddleware, async (c) => {
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
    return c.json(cabangs);
  } catch (error) {
    console.error('Get cabangs error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single cabang
cabang.get('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const result = await prisma.cabang.findUnique({
      where: { id },
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

    if (!result) {
      return c.json({ error: 'Cabang not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Get cabang error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create cabang (Owner only)
cabang.post('/', authMiddleware, ownerOnly, async (c) => {
  try {
    const { name, address, phone } = await c.req.json();

    if (!name || !address) {
      return c.json({ error: 'Name and address are required' }, 400);
    }

    const result = await prisma.cabang.create({
      data: { name, address, phone }
    });

    return c.json(result, 201);
  } catch (error: any) {
    console.error('Create cabang error:', error);
    if (error.code === 'P2002') {
      return c.json({ error: 'Cabang name already exists' }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update cabang (Owner only)
cabang.put('/:id', authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const { name, address, phone, isActive } = await c.req.json();

    const result = await prisma.cabang.update({
      where: { id },
      data: { name, address, phone, isActive }
    });

    return c.json(result);
  } catch (error: any) {
    console.error('Update cabang error:', error);
    if (error.code === 'P2025') {
      return c.json({ error: 'Cabang not found' }, 404);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete cabang (Owner only)
cabang.delete('/:id', authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');

    const result = await prisma.cabang.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            stocks: true,
            transactions: true
          }
        }
      }
    });

    if (!result) {
      return c.json({ error: 'Cabang not found' }, 404);
    }

    if (result._count.users > 0) {
      return c.json({
        error: `Cannot delete cabang. It has ${result._count.users} user(s). Reassign or delete users first.`
      }, 400);
    }

    if (result._count.stocks > 0) {
      return c.json({
        error: `Cannot delete cabang. It has ${result._count.stocks} stock record(s). Transfer or delete stocks first.`
      }, 400);
    }

    if (result._count.transactions > 0) {
      await prisma.cabang.update({
        where: { id },
        data: { isActive: false }
      });

      return c.json({
        message: 'Cabang has transaction history. Cabang has been deactivated.',
        action: 'deactivated'
      });
    }

    await prisma.cabang.delete({ where: { id } });

    return c.json({ message: 'Cabang deleted successfully', action: 'deleted' });
  } catch (error: any) {
    console.error('Delete cabang error:', error);
    if (error.code === 'P2025') {
      return c.json({ error: 'Cabang not found' }, 404);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default cabang;
