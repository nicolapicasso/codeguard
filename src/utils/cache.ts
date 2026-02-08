import type { CodeRule, Project } from '@prisma/client';
import { getRedis } from './redis.js';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

const CACHE_TTL = 300; // 5 minutes
const PROJECT_KEY_PREFIX = 'codeguard:project:';

type ProjectWithRules = Project & { codeRules: CodeRule[] };

export async function getCachedProjectWithRules(
  projectId: string,
): Promise<ProjectWithRules | null> {
  const redis = getRedis();
  const cacheKey = `${PROJECT_KEY_PREFIX}${projectId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as ProjectWithRules;
      // Restore Date objects from JSON strings
      parsed.createdAt = new Date(parsed.createdAt);
      parsed.updatedAt = new Date(parsed.updatedAt);
      if (parsed.startsAt) parsed.startsAt = new Date(parsed.startsAt);
      if (parsed.endsAt) parsed.endsAt = new Date(parsed.endsAt);
      for (const rule of parsed.codeRules) {
        rule.createdAt = new Date(rule.createdAt);
        rule.updatedAt = new Date(rule.updatedAt);
      }
      return parsed;
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache read failed, falling back to DB');
  }

  // Cache miss — load from DB
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { codeRules: { where: { isActive: true } } },
  });

  if (project) {
    try {
      await redis.set(cacheKey, JSON.stringify(project), 'EX', CACHE_TTL);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write failed');
    }
  }

  return project;
}

export async function invalidateProjectCache(projectId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${PROJECT_KEY_PREFIX}${projectId}`);
  } catch (err) {
    logger.warn({ err }, 'Redis cache invalidation failed');
  }
}

export async function invalidateAllProjectCaches(): Promise<void> {
  try {
    const redis = getRedis();
    const keys = await redis.keys(`${PROJECT_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache invalidation failed');
  }
}
