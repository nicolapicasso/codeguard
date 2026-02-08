export const createProjectSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    starts_at: { type: 'string' },
    ends_at: { type: 'string' },
    metadata: { type: 'object' },
  },
} as const;

export const updateProjectSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    starts_at: { type: 'string' },
    ends_at: { type: 'string' },
    is_active: { type: 'boolean' },
    metadata: { type: 'object' },
  },
} as const;
