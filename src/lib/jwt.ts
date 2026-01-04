import jwt, { SignOptions } from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  cabangId: string | null;
}

// Validate JWT_SECRET on module load
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const generateToken = (
  userId: string,
  email: string,
  role: string,
  cabangId: string | null = null
): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
  };
  return jwt.sign(
    { userId, email, role, cabangId },
    JWT_SECRET,
    options
  );
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
};
