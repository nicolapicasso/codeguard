import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma.js';

export async function createProject(tenantId: string, data: {
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.project.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listProjects(tenantId: string) {
  return prisma.project.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { codeRules: true } } },
  });
}

export async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      codeRules: { select: { id: true, name: true, isActive: true, skuReference: true } },
      tenant: { select: { id: true, name: true } },
    },
  });
}

export async function updateProject(id: string, data: {
  name?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}) {
  return prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      isActive: data.isActive,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function deleteProject(id: string) {
  return prisma.project.update({
    where: { id },
    data: { isActive: false },
  });
}
