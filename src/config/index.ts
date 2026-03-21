export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  databaseUrl: process.env.DATABASE_URL || 'postgresql://omnicodex:secret@localhost:5432/omnicodex',

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  hmacToleranceSeconds: parseInt(process.env.HMAC_TOLERANCE_SECONDS || '300', 10),

  rateLimitPerUserPerMinute: parseInt(process.env.RATE_LIMIT_PER_USER_PER_MINUTE || '30', 10),
  rateLimitPerIpPerMinute: parseInt(process.env.RATE_LIMIT_PER_IP_PER_MINUTE || '100', 10),

  storePlainCodes: process.env.STORE_PLAIN_CODES === 'true',
  customFunctionTimeoutMs: parseInt(process.env.CUSTOM_FUNCTION_TIMEOUT_MS || '100', 10),

  // Geo-fencing: comma-separated ISO 3166-1 alpha-2 codes (e.g., "KP,IR,CU,SY")
  globalBannedCountries: (process.env.GLOBAL_BANNED_COUNTRIES || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length === 2),

  // If true, requests without detectable country are rejected when geo-fencing is active
  geoRequireCountry: process.env.GEO_REQUIRE_COUNTRY === 'true',
} as const;
