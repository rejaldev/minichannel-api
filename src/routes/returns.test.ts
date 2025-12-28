import { describe, it, expect, vi, beforeEach } from 'vitest';
import returns from './returns';
import prisma from '../lib/prisma';
import { generateToken } from '../lib/jwt';

// Helper to parse JSON response
const json = async (res: Response) => res.json() as Promise<Record<string, any>>;

describe('Returns Routes', () => {
  const ownerToken = generateToken('owner-1', 'owner@test.com', 'OWNER', null);
  const kasirToken = generateToken('kasir-1', 'kasir@test.com', 'KASIR', 'cab-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /stats', () => {
    it('should return return statistics', async () => {
      vi.mocked(prisma.return.count).mockResolvedValue(5);
      vi.mocked(prisma.return.aggregate).mockResolvedValue({ _sum: { refundAmount: 500000 } } as any);

      const res = await returns.request('/stats', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data).toHaveProperty('pending');
      expect(data).toHaveProperty('completed');
      expect(data).toHaveProperty('totalRefundAmount');
    });
  });

  describe('GET /', () => {
    it('should return list of returns', async () => {
      const mockReturns = [
        {
          id: 'ret-1',
          returnNo: 'RET-001',
          transactionId: 'trans-1',
          reason: 'DEFECTIVE',
          status: 'PENDING',
          refundAmount: 50000,
          createdAt: new Date(),
          transaction: { transactionNo: 'TRX-001' },
          items: [],
          cabang: { name: 'Main Branch' },
        },
      ];
      
      vi.mocked(prisma.return.findMany).mockResolvedValue(mockReturns as any);
      vi.mocked(prisma.return.count).mockResolvedValue(1);

      const res = await returns.request('/', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.returns).toBeDefined();
      expect(data.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      vi.mocked(prisma.return.findMany).mockResolvedValue([]);
      vi.mocked(prisma.return.count).mockResolvedValue(0);

      const res = await returns.request('/?status=PENDING', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      expect(prisma.return.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });
  });

  describe('GET /:id', () => {
    it('should return single return', async () => {
      const mockReturn = {
        id: 'ret-1',
        returnNo: 'RET-001',
        transactionId: 'trans-1',
        reason: 'DEFECTIVE',
        status: 'PENDING',
        refundAmount: 50000,
        createdAt: new Date(),
        transaction: { transactionNo: 'TRX-001' },
        items: [],
      };
      
      vi.mocked(prisma.return.findUnique).mockResolvedValue(mockReturn as any);

      const res = await returns.request('/ret-1', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.return.id).toBe('ret-1');
    });

    it('should return 404 if return not found', async () => {
      vi.mocked(prisma.return.findUnique).mockResolvedValue(null);

      const res = await returns.request('/notfound', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should return 400 if required fields missing', async () => {
      const res = await returns.request('/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'DEFECTIVE',
          // missing transactionId and items
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 if items empty', async () => {
      const res = await returns.request('/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: 'trans-1',
          reason: 'DEFECTIVE',
          items: [],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 if transaction not found', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null);

      const res = await returns.request('/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: 'notfound',
          reason: 'DEFECTIVE',
          items: [{ productVariantId: 'var-1', quantity: 1, price: 10000 }],
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /:id/approve', () => {
    it('should approve return', async () => {
      const mockReturn = {
        id: 'ret-1',
        status: 'PENDING',
        cabangId: 'cab-1',
        items: [{ productVariantId: 'var-1', quantity: 1 }],
      };
      
      vi.mocked(prisma.return.findUnique).mockResolvedValue(mockReturn as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          stock: { update: vi.fn() },
          return: { update: vi.fn().mockResolvedValue({ ...mockReturn, status: 'COMPLETED' }) },
        });
      });

      const res = await returns.request('/ret-1/approve', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approvedBy: 'Manager Name' }),
      });

      expect(res.status).toBe(200);
    });

    it('should return 400 if approvedBy missing', async () => {
      const res = await returns.request('/ret-1/approve', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 if return not pending', async () => {
      vi.mocked(prisma.return.findUnique).mockResolvedValue({
        id: 'ret-1',
        status: 'COMPLETED', // Already completed
      } as any);

      const res = await returns.request('/ret-1/approve', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approvedBy: 'Manager' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id/reject', () => {
    it('should reject return', async () => {
      const mockReturn = {
        id: 'ret-1',
        status: 'PENDING',
      };
      
      vi.mocked(prisma.return.findUnique).mockResolvedValue(mockReturn as any);
      vi.mocked(prisma.return.update).mockResolvedValue({ ...mockReturn, status: 'REJECTED' } as any);

      const res = await returns.request('/ret-1/reject', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rejectedBy: 'Manager', rejectionNotes: 'Invalid return request' }),
      });

      expect(res.status).toBe(200);
    });

    it('should return 404 if return not found', async () => {
      vi.mocked(prisma.return.findUnique).mockResolvedValue(null);

      const res = await returns.request('/ret-1/reject', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rejectedBy: 'Manager' }),
      });

      expect(res.status).toBe(404);
    });
  });
});
