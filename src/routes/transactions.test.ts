import { describe, it, expect, vi, beforeEach } from 'vitest';
import transactions from './transactions';
import prisma from '../lib/prisma';
import { generateToken } from '../lib/jwt';

// Helper to parse JSON response
const json = async (res: Response) => res.json() as Promise<Record<string, any>>;

describe('Transactions Routes', () => {
  const ownerToken = generateToken('owner-1', 'owner@test.com', 'OWNER', null);
  const kasirToken = generateToken('kasir-1', 'kasir@test.com', 'KASIR', 'cab-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return transactions list for owner', async () => {
      const mockTransactions = [
        {
          id: 'trans-1',
          transactionNo: 'TRX-001',
          total: 100000,
          paymentMethod: 'CASH',
          status: 'COMPLETED',
          createdAt: new Date(),
          items: [],
          cabang: { name: 'Main Branch' },
          kasir: { name: 'Kasir 1' },
        },
      ];
      
      vi.mocked(prisma.transaction.findMany).mockResolvedValue(mockTransactions as any);

      const res = await transactions.request('/', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should filter by date range', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);

      const res = await transactions.request('/?startDate=2025-01-01&endDate=2025-01-31', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      expect(prisma.transaction.findMany).toHaveBeenCalled();
    });

    it('should filter by cabangId for kasir', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);

      const res = await transactions.request('/', {
        headers: { Authorization: `Bearer ${kasirToken}` },
      });

      expect(res.status).toBe(200);
      // Kasir should only see their cabang's transactions
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cabangId: 'cab-1',
          }),
        })
      );
    });
  });

  describe('GET /:id', () => {
    it('should return single transaction', async () => {
      const mockTransaction = {
        id: 'trans-1',
        transactionNo: 'TRX-001',
        total: 100000,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        createdAt: new Date(),
        items: [],
        cabang: { name: 'Main Branch' },
        kasir: { name: 'Kasir 1' },
      };
      
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(mockTransaction as any);

      const res = await transactions.request('/trans-1', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.id).toBe('trans-1');
    });

    it('should return 404 if transaction not found', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null);

      const res = await transactions.request('/notfound', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should return 400 if items or paymentMethod missing', async () => {
      const res = await transactions.request('/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kasirToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cabangId: 'cab-1',
          total: 100000,
          paymentMethod: 'CASH',
          // items missing
        }),
      });

      expect(res.status).toBe(400);
      const data = await json(res);
      expect(data.error).toContain('items');
    });

    it('should return 400 if payment method missing', async () => {
      const res = await transactions.request('/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kasirToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cabangId: 'cab-1',
          items: [{ productVariantId: 'var-1', quantity: 1, price: 10000 }],
          total: 10000,
          // paymentMethod missing
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /reports/summary', () => {
    it('should return sales summary', async () => {
      vi.mocked(prisma.transaction.count).mockResolvedValue(10);
      vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
        _sum: { total: 1000000 },
      } as any);
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
        { paymentMethod: 'CASH', _count: { id: 5 }, _sum: { total: 500000 } },
        { paymentMethod: 'QRIS', _count: { id: 5 }, _sum: { total: 500000 } },
      ] as any);

      const res = await transactions.request('/reports/summary', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('totalTransactions');
      expect(data).toHaveProperty('totalRevenue');
    });
  });

  describe('GET /reports/top-products', () => {
    it('should require authentication', async () => {
      const res = await transactions.request('/reports/top-products');
      expect(res.status).toBe(401);
    });

    it('should require owner or manager role', async () => {
      const res = await transactions.request('/reports/top-products', {
        headers: { Authorization: `Bearer ${kasirToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /:id/cancel', () => {
    it('should return 403 for kasir trying to cancel', async () => {
      const res = await transactions.request('/trans-1/cancel', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${kasirToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Test' }),
      });

      expect(res.status).toBe(403);
    });

    it('should return 404 if transaction not found', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null);

      const res = await transactions.request('/trans-1/cancel', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Customer request' }),
      });

      expect(res.status).toBe(404);
    });
  });
});
