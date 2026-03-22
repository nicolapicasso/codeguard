import { prisma } from '../../utils/prisma.js';

/** Recent validation attempts with filtering */
export async function getValidationAttempts(params: {
  tenantId?: string;
  projectId?: string;
  status?: string;
  errorCode?: string;
  ipAddress?: string;
  owUserId?: string;
  days?: number;
  page?: number;
  limit?: number;
}) {
  const { tenantId, projectId, status, errorCode, ipAddress, owUserId, days = 30, page = 1, limit = 50 } = params;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: any = { createdAt: { gte: since } };
  if (tenantId) where.tenantId = tenantId;
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (errorCode) where.errorCode = errorCode;
  if (ipAddress) where.ipAddress = ipAddress;
  if (owUserId) where.owUserId = owUserId;

  const [data, total] = await Promise.all([
    prisma.validationAttempt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.validationAttempt.count({ where }),
  ]);

  return {
    data: data.map((d) => ({
      id: d.id,
      project_id: d.projectId,
      code_rule_id: d.codeRuleId,
      tenant_id: d.tenantId,
      code: d.code,
      status: d.status,
      error_code: d.errorCode,
      error_message: d.errorMessage,
      ow_user_id: d.owUserId,
      ip_address: d.ipAddress,
      detected_country: d.detectedCountry,
      detected_region: d.detectedRegion,
      detected_city: d.detectedCity,
      user_agent: d.userAgent,
      created_at: d.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  };
}

/** Suspicious IPs: IPs with high failure rates */
export async function getSuspiciousIps(params: {
  tenantId?: string;
  days?: number;
  minAttempts?: number;
}) {
  const { tenantId, days = 7, minAttempts = 5 } = params;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const tenantFilter = tenantId ? `AND va."tenant_id" = '${tenantId}'` : '';

  const results = await prisma.$queryRawUnsafe<Array<{
    ip_address: string;
    total_attempts: bigint;
    failed_attempts: bigint;
    distinct_codes: bigint;
    last_attempt: Date;
    countries: string[];
  }>>(`
    SELECT
      va."ip_address",
      COUNT(*) as total_attempts,
      COUNT(*) FILTER (WHERE va."status" = 'KO') as failed_attempts,
      COUNT(DISTINCT va."code") as distinct_codes,
      MAX(va."created_at") as last_attempt,
      ARRAY_AGG(DISTINCT va."detected_country") FILTER (WHERE va."detected_country" IS NOT NULL) as countries
    FROM validation_attempts va
    WHERE va."ip_address" IS NOT NULL
      AND va."created_at" >= $1
      ${tenantFilter}
    GROUP BY va."ip_address"
    HAVING COUNT(*) >= $2
    ORDER BY COUNT(*) FILTER (WHERE va."status" = 'KO') DESC
    LIMIT 50
  `, since, minAttempts);

  return results.map((r) => ({
    ip_address: r.ip_address,
    total_attempts: Number(r.total_attempts),
    failed_attempts: Number(r.failed_attempts),
    failure_rate: Number(r.total_attempts) > 0
      ? Math.round((Number(r.failed_attempts) / Number(r.total_attempts)) * 100)
      : 0,
    distinct_codes: Number(r.distinct_codes),
    last_attempt: r.last_attempt,
    countries: r.countries || [],
  }));
}

/** Suspicious users: users with high failure rates or rapid repeated attempts */
export async function getSuspiciousUsers(params: {
  tenantId?: string;
  days?: number;
  minAttempts?: number;
}) {
  const { tenantId, days = 7, minAttempts = 3 } = params;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const tenantFilter = tenantId ? `AND va."tenant_id" = '${tenantId}'` : '';

  const results = await prisma.$queryRawUnsafe<Array<{
    ow_user_id: string;
    total_attempts: bigint;
    failed_attempts: bigint;
    distinct_codes: bigint;
    distinct_ips: bigint;
    last_attempt: Date;
    countries: string[];
  }>>(`
    SELECT
      va."ow_user_id",
      COUNT(*) as total_attempts,
      COUNT(*) FILTER (WHERE va."status" = 'KO') as failed_attempts,
      COUNT(DISTINCT va."code") as distinct_codes,
      COUNT(DISTINCT va."ip_address") as distinct_ips,
      MAX(va."created_at") as last_attempt,
      ARRAY_AGG(DISTINCT va."detected_country") FILTER (WHERE va."detected_country" IS NOT NULL) as countries
    FROM validation_attempts va
    WHERE va."ow_user_id" IS NOT NULL
      AND va."created_at" >= $1
      ${tenantFilter}
    GROUP BY va."ow_user_id"
    HAVING COUNT(*) >= $2
    ORDER BY COUNT(*) FILTER (WHERE va."status" = 'KO') DESC
    LIMIT 50
  `, since, minAttempts);

  return results.map((r) => ({
    ow_user_id: r.ow_user_id,
    total_attempts: Number(r.total_attempts),
    failed_attempts: Number(r.failed_attempts),
    failure_rate: Number(r.total_attempts) > 0
      ? Math.round((Number(r.failed_attempts) / Number(r.total_attempts)) * 100)
      : 0,
    distinct_codes: Number(r.distinct_codes),
    distinct_ips: Number(r.distinct_ips),
    last_attempt: r.last_attempt,
    countries: r.countries || [],
  }));
}

/** Geo-blocked attempts summary */
export async function getGeoBlockedSummary(params: {
  tenantId?: string;
  days?: number;
}) {
  const { tenantId, days = 30 } = params;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: any = {
    createdAt: { gte: since },
    errorCode: 'GEO_BLOCKED',
  };
  if (tenantId) where.tenantId = tenantId;

  const [total, byCountry, byDay] = await Promise.all([
    prisma.validationAttempt.count({ where }),
    prisma.validationAttempt.groupBy({
      by: ['detectedCountry'],
      where: { ...where, detectedCountry: { not: null } },
      _count: true,
      orderBy: { _count: { detectedCountry: 'desc' } },
      take: 20,
    }),
    prisma.$queryRawUnsafe<Array<{ date: string; count: bigint }>>(`
      SELECT DATE(va."created_at") as date, COUNT(*) as count
      FROM validation_attempts va
      WHERE va."error_code" = 'GEO_BLOCKED'
        AND va."created_at" >= $1
        ${tenantId ? `AND va."tenant_id" = '${tenantId}'` : ''}
      GROUP BY DATE(va."created_at")
      ORDER BY date DESC
    `, since),
  ]);

  return {
    total_blocked: total,
    by_country: byCountry.map((c) => ({
      country: c.detectedCountry || 'Unknown',
      count: c._count,
    })),
    by_day: byDay.map((d) => ({
      date: String(d.date),
      count: Number(d.count),
    })),
  };
}

/** Fraud overview KPIs */
export async function getFraudOverview(params: {
  tenantId?: string;
  days?: number;
}) {
  const { tenantId, days = 7 } = params;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: any = { createdAt: { gte: since } };
  if (tenantId) where.tenantId = tenantId;

  const [totalAttempts, failedAttempts, geoBlocked, alreadyRedeemed, invalidCodes, byDay] = await Promise.all([
    prisma.validationAttempt.count({ where }),
    prisma.validationAttempt.count({ where: { ...where, status: 'KO' } }),
    prisma.validationAttempt.count({ where: { ...where, errorCode: 'GEO_BLOCKED' } }),
    prisma.validationAttempt.count({ where: { ...where, errorCode: 'ALREADY_REDEEMED' } }),
    prisma.validationAttempt.count({ where: { ...where, errorCode: { in: ['INVALID_CODE', 'NO_MATCHING_RULE', 'INVALID_CHECK_DIGIT'] } } }),
    prisma.$queryRawUnsafe<Array<{ date: string; ok: bigint; ko: bigint }>>(`
      SELECT DATE(va."created_at") as date,
        COUNT(*) FILTER (WHERE va."status" = 'OK') as ok,
        COUNT(*) FILTER (WHERE va."status" = 'KO') as ko
      FROM validation_attempts va
      WHERE va."created_at" >= $1
        ${tenantId ? `AND va."tenant_id" = '${tenantId}'` : ''}
      GROUP BY DATE(va."created_at")
      ORDER BY date DESC
    `, since),
  ]);

  return {
    total_attempts: totalAttempts,
    failed_attempts: failedAttempts,
    success_rate: totalAttempts > 0 ? Math.round(((totalAttempts - failedAttempts) / totalAttempts) * 100) : 100,
    geo_blocked: geoBlocked,
    already_redeemed: alreadyRedeemed,
    invalid_codes: invalidCodes,
    by_day: byDay.map((d) => ({
      date: String(d.date),
      ok: Number(d.ok),
      ko: Number(d.ko),
    })),
  };
}
