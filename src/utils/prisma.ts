import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

export const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
