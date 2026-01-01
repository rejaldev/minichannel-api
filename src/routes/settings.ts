import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOnly, ownerOrManager } from '../middleware/auth.js';

const settings = new Hono();

// ============ PRINTER SETTINGS ============
// IMPORTANT: These routes MUST be defined BEFORE /:key route to avoid being caught by it

// Get printer settings by cabang
settings.get('/printer', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');

    if (!cabangId) {
      return c.json({ error: 'cabangId diperlukan' }, 400);
    }

    let printerSettings = await prisma.printerSettings.findUnique({
      where: { cabangId }
    });

    // Create default if not exists
    if (!printerSettings) {
      printerSettings = await prisma.printerSettings.create({
        data: { cabangId }
      });
    }

    return c.json(printerSettings);
  } catch (error) {
    console.error('Get printer settings error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update printer settings (Owner/Manager only)
settings.put('/printer', authMiddleware, ownerOrManager, async (c) => {
  try {
    const body = await c.req.json();
    const { cabangId, storeName, ...data } = body; // Exclude storeName from update

    if (!cabangId) {
      return c.json({ error: 'cabangId diperlukan' }, 400);
    }

    // Validate paperWidth
    if (data.paperWidth && ![58, 80].includes(data.paperWidth)) {
      return c.json({ error: 'paperWidth harus 58 atau 80' }, 400);
    }

    // Verify cabangId exists before upsert
    const cabangExists = await prisma.cabang.findUnique({
      where: { id: cabangId }
    });

    if (!cabangExists) {
      return c.json({
        error: 'Cabang tidak ditemukan',
        detail: `cabangId ${cabangId} tidak ada di database`
      }, 404);
    }

    // Note: storeName is excluded from update - only editable by admin via database
    const printerSettings = await prisma.printerSettings.upsert({
      where: { cabangId },
      update: data,
      create: { cabangId, ...data }
    });

    return c.json({ message: 'Printer settings berhasil disimpan', settings: printerSettings });
  } catch (error) {
    console.error('Update printer settings error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// ============ GENERAL SETTINGS ============

// Get all settings
settings.get('/', authMiddleware, async (c) => {
  try {
    const allSettings = await prisma.settings.findMany();

    // Convert to object format
    const settingsObj: Record<string, string> = {};
    allSettings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });

    return c.json(settingsObj);
  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update or create settings (Owner only)
settings.put('/', authMiddleware, ownerOnly, async (c) => {
  try {
    const settingsData = await c.req.json(); // { lowStockThreshold: '5', criticalStockThreshold: '2' }

    const promises = Object.entries(settingsData).map(([key, value]) => {
      return prisma.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    });

    await Promise.all(promises);

    return c.json({ message: 'Settings berhasil diupdate' });
  } catch (error) {
    console.error('Update settings error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Get specific setting by key - MUST be last because /:key matches everything
settings.get('/:key', authMiddleware, async (c) => {
  try {
    const key = c.req.param('key');
    const setting = await prisma.settings.findUnique({
      where: { key }
    });

    if (!setting) {
      return c.json({ error: 'Setting tidak ditemukan' }, 404);
    }

    return c.json({ key: setting.key, value: setting.value });
  } catch (error) {
    console.error('Get setting error:', error);
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

export default settings;
