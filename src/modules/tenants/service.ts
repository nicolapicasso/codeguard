import { prisma } from '../../utils/prisma.js';
import { generateApiKey, generateApiSecret } from '../../utils/crypto.js';

export async function createTenant(data: {
  owTenantId: string;
  name: string;
  webhookUrl?: string;
}) {
  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();

  return prisma.tenant.create({
    data: {
      owTenantId: data.owTenantId,
      name: data.name,
      apiKey,
      apiSecret,
      webhookUrl: data.webhookUrl,
    },
  });
}

export async function listTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      owTenantId: true,
      name: true,
      isActive: true,
      webhookUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getTenant(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: { projects: { select: { id: true, name: true, isActive: true } } },
  });
}

export async function updateTenant(id: string, data: {
  name?: string;
  isActive?: boolean;
  webhookUrl?: string;
}) {
  return prisma.tenant.update({ where: { id }, data });
}

export async function rotateKeys(id: string) {
  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();

  return prisma.tenant.update({
    where: { id },
    data: { apiKey, apiSecret },
  });
}
