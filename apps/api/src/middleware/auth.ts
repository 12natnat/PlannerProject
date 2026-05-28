import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../lib/jwt';
import prisma from '../lib/prisma';
import redis from '../lib/redis';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      role: string;
    };
  }
}

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'User not found or inactive' });
    }

    // Attach user to request
    request.user = {
      id: user.id,
      role: user.role,
    };
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Token expired or invalid' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Note: this assumes authenticate has already run
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(request.user.role) && request.user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Forbidden', message: 'You do not have permission for this action' });
    }
  };
};
