const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// Get all settings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const settings = await prisma.settings.findMany();

    // Convert to object format
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });

    res.json(settingsObj);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get specific setting by key
router.get('/:key', authMiddleware, async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await prisma.settings.findUnique({
      where: { key }
    });

    if (!setting) {
      return res.status(404).json({ error: 'Setting tidak ditemukan' });
    }

    res.json({ key: setting.key, value: setting.value });
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update or create settings (Owner only)
router.put('/', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const settingsData = req.body; // { lowStockThreshold: '5', criticalStockThreshold: '2' }

    const promises = Object.entries(settingsData).map(([key, value]) => {
      return prisma.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    });

    await Promise.all(promises);

    res.json({ message: 'Settings berhasil diupdate' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// ============ PRINTER SETTINGS ============

// Get printer settings by cabang
router.get('/printer', authMiddleware, async (req, res) => {
  try {
    const { cabangId } = req.query;

    if (!cabangId) {
      return res.status(400).json({ error: 'cabangId diperlukan' });
    }

    let settings = await prisma.printerSettings.findUnique({
      where: { cabangId }
    });

    // Create default if not exists
    if (!settings) {
      settings = await prisma.printerSettings.create({
        data: { cabangId }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Get printer settings error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update printer settings
router.put('/printer', authMiddleware, async (req, res) => {
  try {
    const { cabangId, ...data } = req.body;

    if (!cabangId) {
      return res.status(400).json({ error: 'cabangId diperlukan' });
    }

    // Validate paperWidth
    if (data.paperWidth && ![58, 80].includes(data.paperWidth)) {
      return res.status(400).json({ error: 'paperWidth harus 58 atau 80' });
    }

    // Validate printCopies
    if (data.printCopies && (data.printCopies < 1 || data.printCopies > 5)) {
      return res.status(400).json({ error: 'printCopies harus antara 1-5' });
    }

    const settings = await prisma.printerSettings.upsert({
      where: { cabangId },
      update: data,
      create: { cabangId, ...data }
    });

    res.json({ message: 'Printer settings berhasil disimpan', settings });
  } catch (error) {
    console.error('Update printer settings error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
