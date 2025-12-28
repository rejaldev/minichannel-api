import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateToken, verifyToken } from '../lib/jwt';

describe('JWT Utility', () => {
  const testPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'OWNER',
    cabangId: 'cabang-1',
  };

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(
        testPayload.userId,
        testPayload.email,
        testPayload.role,
        testPayload.cabangId
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate token with null cabangId', () => {
      const token = generateToken(
        testPayload.userId,
        testPayload.email,
        testPayload.role,
        null
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('verifyToken', () => {
    it('should verify and decode a valid token', () => {
      const token = generateToken(
        testPayload.userId,
        testPayload.email,
        testPayload.role,
        testPayload.cabangId
      );

      const decoded = verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(testPayload.userId);
      expect(decoded?.email).toBe(testPayload.email);
      expect(decoded?.role).toBe(testPayload.role);
      expect(decoded?.cabangId).toBe(testPayload.cabangId);
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for malformed token', () => {
      const decoded = verifyToken('not.a.valid.jwt.token');
      expect(decoded).toBeNull();
    });

    it('should return null for empty token', () => {
      const decoded = verifyToken('');
      expect(decoded).toBeNull();
    });
  });

  describe('Token Round-trip', () => {
    it('should encode and decode all user roles', () => {
      const roles = ['OWNER', 'MANAGER', 'ADMIN', 'KASIR'];

      roles.forEach((role) => {
        const token = generateToken('user-1', 'test@test.com', role, 'cab-1');
        const decoded = verifyToken(token);
        expect(decoded?.role).toBe(role);
      });
    });
  });
});
