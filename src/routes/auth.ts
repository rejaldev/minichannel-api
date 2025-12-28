import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { generateToken } from '../lib/jwt';
import { authMiddleware, ownerOnly } from '../middleware/auth';

const auth = new Hono();

// Register (hanya untuk testing)
auth.post('/register', async (c) => {
  try {
    const { email, password, name, role, cabangId } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, dan nama wajib diisi' }, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'KASIR',
        cabangId: cabangId || null
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        cabang: {
          select: { id: true, name: true }
        }
      }
    });

    const token = generateToken(user.id, user.email, user.role, null);

    return c.json({ message: 'User berhasil dibuat', user, token }, 201);
  } catch (error) {
    console.error('Register error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Login
auth.post('/login', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Request body harus berupa JSON valid' }, 400);
    }
    
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: 'Email dan password wajib diisi' }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        cabang: {
          select: { id: true, name: true }
        }
      }
    });

    if (!user) {
      return c.json({ error: 'Email atau password salah' }, 401);
    }

    if (!user.isActive) {
      return c.json({ error: 'Akun Anda tidak aktif' }, 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return c.json({ error: 'Email atau password salah' }, 401);
    }

    const token = generateToken(user.id, user.email, user.role, user.cabangId);
    const { password: _, ...userWithoutPassword } = user;

    return c.json({ message: 'Login berhasil', user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Get current user
auth.get('/me', authMiddleware, async (c) => {
  try {
    const authUser = c.get('user');
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: { id: true, name: true, address: true, phone: true }
        },
        createdAt: true
      }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    return c.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Logout
auth.post('/logout', authMiddleware, async (c) => {
  return c.json({ message: 'Logout berhasil' });
});

// Get all users (Owner only)
auth.get('/users', authMiddleware, ownerOnly, async (c) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabangId: true,
        cabang: {
          select: { id: true, name: true }
        },
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return c.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Create user (Owner only)
auth.post('/users', authMiddleware, ownerOnly, async (c) => {
  try {
    const { email, password, name, role, cabangId } = await c.req.json();

    if (!email || !password || !name || !role) {
      return c.json({ error: 'Email, password, name, dan role wajib diisi' }, 400);
    }

    if (role !== 'ADMIN' && role !== 'OWNER' && !cabangId) {
      return c.json({ error: 'cabangId wajib diisi untuk role KASIR/MANAGER' }, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        cabangId
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: { id: true, name: true }
        },
        createdAt: true
      }
    });

    return c.json({ message: 'User berhasil dibuat', user }, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update user (Owner only)
auth.put('/users/:id', authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const { name, role, cabangId, password, isActive } = await c.req.json();

    if (!name || !role) {
      return c.json({ error: 'Nama dan role wajib diisi' }, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    const updateData: any = {
      name,
      role,
      cabangId,
      isActive: isActive !== undefined ? isActive : existingUser.isActive
    };

    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: { id: true, name: true }
        },
        updatedAt: true
      }
    });

    return c.json({ message: 'User berhasil diupdate', user });
  } catch (error) {
    console.error('Update user error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Delete user (Owner only)
auth.delete('/users/:id', authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const authUser = c.get('user');

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            transactions: true,
            processedReturns: true
          }
        }
      }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    if (user.id === authUser.userId) {
      return c.json({ error: 'Tidak bisa menghapus akun sendiri' }, 400);
    }

    if (user._count.transactions > 0 || user._count.processedReturns > 0) {
      await prisma.user.update({
        where: { id },
        data: { isActive: false }
      });

      return c.json({
        message: 'User memiliki riwayat transaksi. User telah dinonaktifkan.',
        action: 'deactivated'
      });
    }

    await prisma.user.delete({
      where: { id }
    });

    return c.json({ message: 'User berhasil dihapus', action: 'deleted' });
  } catch (error: any) {
    console.error('Delete user error:', error);
    if (error.code === 'P2025') {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

export default auth;
