const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { generateToken } = require('../lib/jwt');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// Register (hanya untuk testing, production bisa dimatikan)
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, cabangId } = req.body;

    // Validasi
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, dan nama wajib diisi' });
    }

    // Cek email sudah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru
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
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Generate token
    const token = generateToken(user.id, user.email, user.role, user.cabangId);

    res.status(201).json({
      message: 'User berhasil dibuat',
      user,
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validasi
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // Cari user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        cabang: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Cek user aktif
    if (!user.isActive) {
      return res.status(401).json({ error: 'Akun Anda tidak aktif' });
    }

    // Verifikasi password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Generate token
    const token = generateToken(user.id, user.email, user.role, user.cabangId);

    // Response tanpa password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login berhasil',
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get current user (me)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Logout (client-side, hapus token)
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logout berhasil' });
});

// Get all users (Owner only)
router.get('/users', authMiddleware, ownerOnly, async (req, res) => {
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
          select: {
            id: true,
            name: true
          }
        },
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Create user (Owner only)
router.post('/users', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { email, password, name, role, cabangId } = req.body;

    // Validasi - ADMIN tidak butuh cabangId
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, dan role wajib diisi' });
    }

    // Validate cabangId - hanya KASIR dan ADMIN yang wajib punya cabangId
    // OWNER dan MANAGER bisa akses semua cabang (cabangId = null)
    if ((role === 'KASIR' || role === 'ADMIN') && !cabangId) {
      return res.status(400).json({ error: 'cabangId wajib diisi untuk role KASIR/ADMIN' });
    }

    // Cek email sudah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru
    // OWNER dan MANAGER tidak terkait cabang (cabangId = null)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        cabangId: (role === 'OWNER' || role === 'MANAGER') ? null : cabangId
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: {
            id: true,
            name: true
          }
        },
        createdAt: true
      }
    });

    res.status(201).json({
      message: 'User berhasil dibuat',
      user
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update user (Owner only)
router.put('/users/:id', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, cabangId, password, isActive } = req.body;

    // Validasi
    if (!name || !role) {
      return res.status(400).json({ error: 'Nama dan role wajib diisi' });
    }

    // KASIR dan ADMIN wajib punya cabangId, OWNER dan MANAGER tidak
    if ((role === 'KASIR' || role === 'ADMIN') && !cabangId) {
      return res.status(400).json({ error: 'cabangId wajib diisi untuk role KASIR/ADMIN' });
    }

    // Cek user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    // Prepare update data
    // OWNER dan MANAGER tidak terkait cabang (cabangId = null)
    const updateData = {
      name,
      role,
      cabangId: (role === 'OWNER' || role === 'MANAGER') ? null : cabangId,
      isActive: isActive !== undefined ? isActive : existingUser.isActive
    };

    // Jika password diisi, hash dan update
    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
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
          select: {
            id: true,
            name: true
          }
        },
        updatedAt: true
      }
    });

    res.json({
      message: 'User berhasil diupdate',
      user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Delete user (Owner only)
router.delete('/users/:id', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
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
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    // Prevent deleting yourself
    if (user.id === req.user.userId) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
    }

    // Check if user has transaction history
    if (user._count.transactions > 0 || user._count.processedReturns > 0) {
      // Soft delete - deactivate instead
      await prisma.user.update({
        where: { id },
        data: { isActive: false }
      });

      return res.json({ 
        message: 'User memiliki riwayat transaksi. User telah dinonaktifkan.',
        action: 'deactivated'
      });
    }

    // Safe to hard delete
    await prisma.user.delete({
      where: { id }
    });

    res.json({ 
      message: 'User berhasil dihapus',
      action: 'deleted'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
