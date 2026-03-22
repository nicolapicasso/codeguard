import { prisma } from '../../utils/prisma.js';

/** Global overview stats for the admin dashboard */
export async function getAdminOverview() {
  const [
    totalTenants,
    activeTenants,
    totalProjects,
    totalRules,
    totalRedemptions,
    uniqueUsers,
    totalBatches,
    totalCodesGenerated,
    recentActivity,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.project.count(),
    prisma.codeRule.count(),
    prisma.redeemedCode.count(),
    prisma.redeemedCode.groupBy({
      by: ['owUserId'],
      where: { owUserId: { not: null } },
    }).then((r) => r.length),
    prisma.codeBatch.count(),
    prisma.codeBatch.aggregate({ _sum: { generatedCount: true } }).then((r) => r._sum.generatedCount || 0),
    getGlobalRedemptionsByDay(30),
  ]);

  return {
    total_tenants: totalTenants,
    active_tenants: activeTenants,
    total_projects: totalProjects,
    total_rules: totalRules,
    total_redemptions: totalRedemptions,
    unique_users: uniqueUsers,
    total_batches: totalBatches,
    total_codes_generated: totalCodesGenerated,
    recent_activity: recentActivity,
  };
}

/** Per-tenant stats with per-project breakdown */
export async function getTenantStats(tenantId: string, days = 30) {
  const projects = await prisma.project.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  const projectIds = projects.map((p) => p.id);

  const [totalRedemptions, uniqueUsers, byProject, byDay, batchStats] = await Promise.all([
    prisma.redeemedCode.count({
      where: { codeRule: { projectId: { in: projectIds } } },
    }),
    prisma.redeemedCode.groupBy({
      by: ['owUserId'],
      where: { codeRule: { projectId: { in: projectIds } }, owUserId: { not: null } },
    }).then((r) => r.length),
    getRedemptionsByProject(projectIds),
    getRedemptionsByDayForTenant(projectIds, days),
    getBatchStatsByTenant(projectIds),
  ]);

  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  return {
    tenant_id: tenantId,
    total_redemptions: totalRedemptions,
    unique_users: uniqueUsers,
    total_batches: batchStats.total,
    total_codes_generated: batchStats.codesGenerated,
    by_project: byProject.map((p) => ({
      project_id: p.projectId,
      project_name: projectMap.get(p.projectId) || 'Unknown',
      redemptions: p._count,
    })),
    by_day: byDay,
  };
}

/** Enhanced per-project stats with time series per rule */
export async function getAdminProjectStats(projectId: string, days = 30) {
  const [totalRedemptions, uniqueUsers, byRule, byDay, byCountry, batchStats] = await Promise.all([
    prisma.redeemedCode.count({
      where: { codeRule: { projectId } },
    }),
    prisma.redeemedCode.groupBy({
      by: ['owUserId'],
      where: { codeRule: { projectId }, owUserId: { not: null } },
    }).then((r) => r.length),
    prisma.redeemedCode.groupBy({
      by: ['codeRuleId'],
      where: { codeRule: { projectId } },
      _count: true,
    }),
    getRedemptionsByDayForProject(projectId, days),
    getRedemptionsByCountry(projectId),
    getBatchStatsForProject(projectId),
  ]);

  const rules = await prisma.codeRule.findMany({
    where: { projectId },
    select: { id: true, name: true, generationMode: true },
  });
  const ruleMap = new Map(rules.map((r) => [r.id, r]));

  return {
    project_id: projectId,
    total_redemptions: totalRedemptions,
    unique_users: uniqueUsers,
    total_batches: batchStats.total,
    total_codes_generated: batchStats.codesGenerated,
    by_rule: byRule.map((r) => ({
      rule_id: r.codeRuleId,
      rule_name: ruleMap.get(r.codeRuleId)?.name || 'Unknown',
      generation_mode: ruleMap.get(r.codeRuleId)?.generationMode || 'EXTERNAL',
      redemptions: r._count,
    })),
    by_day: byDay,
    by_country: byCountry,
  };
}

// --- Helper queries ---

async function getGlobalRedemptionsByDay(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT DATE(rc."redeemed_at") as date, COUNT(*) as count
    FROM redeemed_codes rc
    WHERE rc."redeemed_at" >= ${since}
    GROUP BY DATE(rc."redeemed_at")
    ORDER BY date DESC
  `;
  return results.map((r) => ({ date: String(r.date), count: Number(r.count) }));
}

async function getRedemptionsByProject(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return prisma.redeemedCode.groupBy({
    by: ['codeRuleId'],
    where: { codeRule: { projectId: { in: projectIds } } },
    _count: true,
  }).then(async (groups) => {
    // Re-group by projectId
    const rules = await prisma.codeRule.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true },
    });
    const ruleToProject = new Map(rules.map((r) => [r.id, r.projectId]));
    const byProject = new Map<string, number>();
    for (const g of groups) {
      const pid = ruleToProject.get(g.codeRuleId) || '';
      byProject.set(pid, (byProject.get(pid) || 0) + g._count);
    }
    return Array.from(byProject.entries()).map(([projectId, count]) => ({
      projectId,
      _count: count,
    }));
  });
}

async function getRedemptionsByDayForTenant(projectIds: string[], days: number) {
  if (projectIds.length === 0) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await prisma.$queryRaw<Array<{ date: string; project_id: string; count: bigint }>>`
    SELECT DATE(rc."redeemed_at") as date, cr."project_id", COUNT(*) as count
    FROM redeemed_codes rc
    JOIN code_rules cr ON rc."code_rule_id" = cr.id
    WHERE cr."project_id" = ANY(${projectIds})
      AND rc."redeemed_at" >= ${since}
    GROUP BY DATE(rc."redeemed_at"), cr."project_id"
    ORDER BY date DESC
  `;
  return results.map((r) => ({
    date: String(r.date),
    project_id: r.project_id,
    count: Number(r.count),
  }));
}

async function getRedemptionsByDayForProject(projectId: string, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT DATE(rc."redeemed_at") as date, COUNT(*) as count
    FROM redeemed_codes rc
    JOIN code_rules cr ON rc."code_rule_id" = cr.id
    WHERE cr."project_id" = ${projectId}
      AND rc."redeemed_at" >= ${since}
    GROUP BY DATE(rc."redeemed_at")
    ORDER BY date DESC
  `;
  return results.map((r) => ({ date: String(r.date), count: Number(r.count) }));
}

async function getRedemptionsByCountry(projectId: string) {
  const results = await prisma.redeemedCode.groupBy({
    by: ['detectedCountry'],
    where: { codeRule: { projectId }, detectedCountry: { not: null } },
    _count: true,
    orderBy: { _count: { detectedCountry: 'desc' } },
    take: 20,
  });
  return results.map((r) => ({
    country: r.detectedCountry || 'Unknown',
    count: r._count,
  }));
}

async function getBatchStatsByTenant(projectIds: string[]) {
  if (projectIds.length === 0) return { total: 0, codesGenerated: 0 };
  const [total, agg] = await Promise.all([
    prisma.codeBatch.count({
      where: { codeRule: { projectId: { in: projectIds } } },
    }),
    prisma.codeBatch.aggregate({
      where: { codeRule: { projectId: { in: projectIds } } },
      _sum: { generatedCount: true },
    }),
  ]);
  return { total, codesGenerated: agg._sum.generatedCount || 0 };
}

async function getBatchStatsForProject(projectId: string) {
  const [total, agg] = await Promise.all([
    prisma.codeBatch.count({
      where: { codeRule: { projectId } },
    }),
    prisma.codeBatch.aggregate({
      where: { codeRule: { projectId } },
      _sum: { generatedCount: true },
    }),
  ]);
  return { total, codesGenerated: agg._sum.generatedCount || 0 };
}
