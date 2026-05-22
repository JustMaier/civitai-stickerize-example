import jwt from 'jsonwebtoken';
import { env } from '$env/dynamic/private';

const JWT_SECRET = env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = '30d'; // 30 days
const REFRESH_THRESHOLD_DAYS = 7; // Refresh if within 7 days of expiry

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function generateToken(payload: { userId: string; email: string }): string {
  return jwt.sign(
    { userId: payload.userId, email: payload.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, algorithm: 'HS256' }
  );
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    }) as JWTPayload;

    // Validate required claims
    if (!decoded.userId || !decoded.email) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function shouldRefreshToken(payload: JWTPayload): boolean {
  if (!payload.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  const daysUntilExpiry = (payload.exp - now) / (60 * 60 * 24);
  return daysUntilExpiry < REFRESH_THRESHOLD_DAYS;
}

export function refreshToken(payload: JWTPayload): string {
  return generateToken({ userId: payload.userId, email: payload.email });
}
