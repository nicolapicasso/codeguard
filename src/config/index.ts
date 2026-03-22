export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  databaseUrl: process.env.DATABASE_URL || 'postgresql://omnicodex:secret@localhost:5432/omnicodex',

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  hmacToleranceSeconds: parseInt(process.env.HMAC_TOLERANCE_SECONDS || '60', 10),

  rateLimitPerUserPerMinute: parseInt(process.env.RATE_LIMIT_PER_USER_PER_MINUTE || '30', 10),
  rateLimitPerIpPerMinute: parseInt(process.env.RATE_LIMIT_PER_IP_PER_MINUTE || '100', 10),

  storePlainCodes: process.env.STORE_PLAIN_CODES === 'true',

  // SECURITY: Server-side pepper for code hash storage (HMAC-keyed).
  // Prevents rainbow table attacks on code hashes if DB is compromised.
  codeHashPepper: process.env.CODE_HASH_PEPPER || 'dev-pepper-change-in-production',

  // Geo-fencing: comma-separated ISO 3166-1 alpha-2 codes (e.g., "KP,IR,CU,SY")
  globalBannedCountries: (process.env.GLOBAL_BANNED_COUNTRIES || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length === 2),

  // If true, requests without detectable country are rejected when geo-fencing is active
  geoRequireCountry: process.env.GEO_REQUIRE_COUNTRY === 'true',

  // Batch generation (MANAGED mode)
  batchEncryptionKey: process.env.BATCH_ENCRYPTION_KEY || process.env.CODE_HASH_PEPPER || 'dev-pepper-change-in-production',
  batchMaxConcurrentPerTenant: parseInt(process.env.BATCH_MAX_CONCURRENT_PER_TENANT || '3', 10),
  batchChunkSize: parseInt(process.env.BATCH_CHUNK_SIZE || '5000', 10),
  batchJobTimeoutMs: parseInt(process.env.BATCH_JOB_TIMEOUT_MS || '1800000', 10),
} as const;
