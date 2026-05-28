import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { authenticate } from '../middleware/auth';

export default async function authRoutes(server: FastifyInstance) {
  // Login
  server.post('/api/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials or inactive account' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    return reply.send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  });

  // Refresh
  server.post('/api/v1/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.body as any;

    if (!refreshToken) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Refresh token is required' });
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'User not found or inactive' });
      }

      const accessToken = generateAccessToken(user.id, user.role);
      const newRefreshToken = generateRefreshToken(user.id);

      return reply.send({ accessToken, refreshToken: newRefreshToken });
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
    }
  });

  // Me
  server.get('/api/v1/auth/me', { preValidation: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }

    return reply.send({ user });
  });
}
