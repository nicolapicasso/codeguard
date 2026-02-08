import { prisma } from '../../utils/prisma.js';

export async function getProjectStats(projectId: string) {
  const [totalRedemptions, uniqueUsers, byRule, byDay] = await Promise.all([
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
    getRedemptionsByDay(projectId, 30),
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
    by_day: byDay,
  };
}

async function getRedemptionsByDay(projectId: string, days: number) {
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

  return results.map((r) => ({
    date: String(r.date),
    count: Number(r.count),
  }));
}
