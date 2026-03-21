export const validateRequestSchema = {
  type: 'object',
  required: ['code', 'project_id'],
  properties: {
    code: { type: 'string', minLength: 1 },
    project_id: { type: 'string', format: 'uuid' },
    ow_user_id: { type: 'string' },
    ow_transaction_id: { type: 'string' },
    country: { type: 'string', minLength: 2, maxLength: 2 },
    metadata: { type: 'object' },
  },
} as const;

// SECURITY: GET /validate/check removed from public API (oracle attack vector).
// Code testing available via Admin API: POST /api/admin/rules/:id/test

export const listCodesQuerySchema = {
  type: 'object',
  properties: {
    project_id: { type: 'string', format: 'uuid' },
    from: { type: 'string', format: 'date' },
    to: { type: 'string', format: 'date' },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  },
} as const;
