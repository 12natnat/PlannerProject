import jwt from 'jsonwebtoken';
import { config } from '../config';

export const generateAccessToken = (userId: string, role: string) => {
  return jwt.sign({ userId, role }, config.jwt.secret, { expiresIn: config.jwt.accessExpiry as any });
};

export const generateRefreshToken = (userId: string) => {
  return jwt.sign({ userId }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry as any });
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, config.jwt.secret) as { userId: string; role: string; iat: number; exp: number };
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, config.jwt.refreshSecret) as { userId: string; iat: number; exp: number };
};
