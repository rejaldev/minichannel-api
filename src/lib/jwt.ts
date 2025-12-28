import jwt, { SignOptions } from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  cabangId: string | null;
}

export const generateToken = (
  userId: string,
  email: string,
  role: string,
  cabangId: string | null = null
): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn']
  };
  return jwt.sign(
    { userId, email, role, cabangId },
    process.env.JWT_SECRET as string,
    options
  );
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
  } catch {
    return null;
  }
};
