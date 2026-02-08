export const createCodeRuleSchema = {
  type: 'object',
  required: ['name', 'total_length', 'charset', 'has_check_digit', 'structure_def'],
  properties: {
    name: { type: 'string', minLength: 1 },
    sku_reference: { type: 'string' },
    total_length: { type: 'integer', minimum: 1 },
    charset: { type: 'string', enum: ['NUMERIC', 'ALPHA_UPPER', 'ALPHA_LOWER', 'ALPHANUMERIC', 'CUSTOM'] },
    custom_charset: { type: 'string' },
    has_check_digit: { type: 'boolean' },
    check_algorithm: { type: 'string', enum: ['LUHN', 'MOD10', 'MOD11', 'MOD97', 'VERHOEFF', 'DAMM', 'CUSTOM'] },
    check_digit_position: { type: 'string', enum: ['LAST', 'FIRST'] },
    structure_def: { type: 'object' },
    separator: { type: 'string' },
    case_sensitive: { type: 'boolean' },
    prefix: { type: 'string' },
    max_redemptions: { type: 'integer', minimum: 1 },
    product_info: { type: 'object' },
    campaign_info: { type: 'object' },
    points_value: { type: 'integer' },
    custom_check_function: { type: 'string' },
  },
} as const;

export const updateCodeRuleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    sku_reference: { type: 'string' },
    is_active: { type: 'boolean' },
    max_redemptions: { type: 'integer', minimum: 1 },
    product_info: { type: 'object' },
    campaign_info: { type: 'object' },
    points_value: { type: 'integer' },
  },
} as const;

export const testCodeSchema = {
  type: 'object',
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 1 },
  },
} as const;
