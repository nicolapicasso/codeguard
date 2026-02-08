export const createTenantSchema = {
  type: 'object',
  required: ['ow_tenant_id', 'name'],
  properties: {
    ow_tenant_id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    webhook_url: { type: 'string', format: 'uri' },
  },
} as const;

export const updateTenantSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    is_active: { type: 'boolean' },
    webhook_url: { type: 'string' },
  },
} as const;
