export const validateRequestSchema = {
  type: 'object',
  required: ['code', 'project_id'],
  properties: {
    code: { type: 'string', minLength: 1 },
    project_id: { type: 'string', format: 'uuid' },
    ow_user_id: { type: 'string' },
    ow_transaction_id: { type: 'string' },
    metadata: { type: 'object' },
  },
} as const;

export const validateCheckQuerySchema = {
  type: 'object',
  required: ['code', 'project_id'],
  properties: {
    code: { type: 'string', minLength: 1 },
    project_id: { type: 'string', format: 'uuid' },
  },
} as const;

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
