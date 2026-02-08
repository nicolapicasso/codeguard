import { prisma } from '../../utils/prisma.js';

export async function getProjectStats(projectId: string) {
  const [totalRedemptions, uniqueUsers, byRule, errorRate] = await Promise.all([
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
    Promise.resolve(0), // Error rate would require audit logging — placeholder
  ]);

  const rules = await prisma.codeRule.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });

  const ruleMap = new Map(rules.map((r) => [r.id, r.name]));

  return {
    project_id: projectId,
    total_redemptions: totalRedemptions,
    unique_users: uniqueUsers,
    by_rule: byRule.map((r) => ({
      rule_id: r.codeRuleId,
      rule_name: ruleMap.get(r.codeRuleId) || 'Unknown',
      count: r._count,
    })),
    error_rate: errorRate,
  };
}
