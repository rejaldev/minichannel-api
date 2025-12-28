import { describe, it, expect, vi, beforeEach } from 'vitest';
import stock from './stock';
import prisma from '../lib/prisma';
import { generateToken } from '../lib/jwt';

// Helper to parse JSON response
const json = async (res: Response) => res.json() as Promise<Record<string, any>>;

describe('Stock Routes', () => {
  const ownerToken = generateToken('owner-1', 'owner@test.com', 'OWNER', null);
  const managerToken = generateToken('manager-1', 'manager@test.com', 'MANAGER', 'cab-1');
  const kasirToken = generateToken('kasir-1', 'kasir@test.com', 'KASIR', 'cab-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /adjustments', () => {
    it('should return stock adjustments list', async () => {
      const mockAdjustments = [
        {
          id: 'adj-1',
          productVariantId: 'var-1',
          stockId: 'stock-1',
          cabangId: 'cab-1',
          previousQty: 100,
          newQty: 150,
          difference: 50,
          reason: 'STOCK_OPNAME',
          createdAt: new Date(),
          productVariant: { product: { id: 'prod-1', name: 'Product 1' } },
          cabang: { id: 'cab-1', name: 'Branch 1' },
          adjustedBy: { id: 'user-1', name: 'Admin' },
        },
      ];
      
      vi.mocked(prisma.stockAdjustment.findMany).mockResolvedValue(mockAdjustments as any);
      vi.mocked(prisma.stockAdjustment.count).mockResolvedValue(1);

      const res = await stock.request('/adjustments', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.data).toBeDefined();
      expect(data.pagination).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const res = await stock.request('/adjustments');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /adjustment', () => {
    it('should create stock adjustment for owner', async () => {
      const mockStockRecord = {
        id: 'stock-1',
        quantity: 100,
        productVariantId: 'var-1',
        cabangId: 'cab-1',
        productVariant: {
          product: { id: 'prod-1', name: 'Product 1' }
        },
        cabang: { name: 'Branch 1' }
      };

      vi.mocked(prisma.stock.findFirst).mockResolvedValue(mockStockRecord as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          stock: { update: vi.fn().mockResolvedValue({ ...mockStockRecord, quantity: 150 }) },
          stockAdjustment: { 
            create: vi.fn().mockResolvedValue({
              id: 'adj-1',
              productVariantId: 'var-1',
              previousQty: 100,
              newQty: 150,
              difference: 50,
              productVariant: { product: { id: 'prod-1', name: 'Product 1' } },
              cabang: { id: 'cab-1', name: 'Branch 1' },
              adjustedBy: { id: 'owner-1', name: 'Owner' }
            }) 
          },
        });
      });

      const res = await stock.request('/adjustment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'var-1',
          cabangId: 'cab-1',
          type: 'add',
          quantity: 50,
          reason: 'restock'
        }),
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.success).toBe(true);
    });

    it('should return 400 if required fields missing', async () => {
      const res = await stock.request('/adjustment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'var-1',
          // missing cabangId, type, quantity
        }),
      });

      expect(res.status).toBe(400);
      const data = await json(res);
      expect(data.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid type', async () => {
      const res = await stock.request('/adjustment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'var-1',
          cabangId: 'cab-1',
          type: 'invalid',
          quantity: 50
        }),
      });

      expect(res.status).toBe(400);
      const data = await json(res);
      expect(data.error).toContain('add');
    });

    it('should return 400 for negative quantity', async () => {
      const res = await stock.request('/adjustment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'var-1',
          cabangId: 'cab-1',
          type: 'add',
          quantity: -5  // negative quantity should fail
        }),
      });

      expect(res.status).toBe(400);
      const data = await json(res);
      expect(data.error).toContain('greater than 0');
    });

    it('should return 404 if stock record not found', async () => {
      vi.mocked(prisma.stock.findFirst).mockResolvedValue(null);

      const res = await stock.request('/adjustment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'var-not-found',
          cabangId: 'cab-1',
          type: 'add',
          quantity: 50
        }),
      });

      expect(res.status).toBe(404);
    });

    it('should return 400 when subtracting more than available', async () => {
      vi.mocked(prisma.stock.findFirst).mockResolvedValue({
        id: 'stock-1',
        quantity: 10,
        productVariantId: 'var-1',
        cabangId: 'cab-1',
        productVariant: { product: { id: 'prod-1', name: 'Product 1' } },
        cabang: { name: 'Branch 1' }
      } as any);

      const res = await stock.request('/adjustment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'var-1',
          cabangId: 'cab-1',
          type: 'subtract',
          quantity: 20 // more than available
        }),
      });

      expect(res.status).toBe(400);
      const data = await json(res);
      expect(data.error).toContain('Cannot subtract');
    });
  });

  describe('GET /adjustment/:variantId/:cabangId/history', () => {
    it('should return adjustment history', async () => {
      const mockAdjustments = [
        {
          id: 'adj-1',
          previousQty: 100,
          newQty: 150,
          difference: 50,
          createdAt: new Date(),
          adjustedBy: { id: 'user-1', name: 'Admin' },
          cabang: { id: 'cab-1', name: 'Branch 1' }
        },
      ];
      
      vi.mocked(prisma.stockAdjustment.findMany).mockResolvedValue(mockAdjustments as any);

      const res = await stock.request('/adjustment/var-1/cab-1/history', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.data).toBeDefined();
    });
  });

  describe('POST /alert', () => {
    it('should require authentication', async () => {
      const res = await stock.request('/alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'var-1',
          cabangId: 'cab-1',
          minStock: 10
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /alerts/low', () => {
    it('should require authentication', async () => {
      const res = await stock.request('/alerts/low');
      expect(res.status).toBe(401);
    });
  });
});

