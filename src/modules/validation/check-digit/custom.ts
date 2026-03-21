/**
 * CUSTOM — Safe declarative DSL for custom check digit calculations.
 *
 * SECURITY: Node.js `vm` module was removed — it is NOT a secure sandbox.
 * Instead, we support a small set of safe, declarative expressions:
 *
 * Supported DSL operations:
 *   - "weighted_sum": Multiply each digit by a weight, sum, mod N
 *   - "xor": XOR all digit values
 *   - "cross_sum": Recursive cross-sum until single digit
 *
 * Format: JSON string like:
 *   {"type": "weighted_sum", "weights": [3,1,3,1,...], "mod": 10, "complement": true}
 *   {"type": "xor"}
 *   {"type": "cross_sum"}
 */

export interface WeightedSumDSL {
  type: 'weighted_sum';
  weights: number[];
  mod: number;
  complement?: boolean;
}

export interface XorDSL {
  type: 'xor';
}

export interface CrossSumDSL {
  type: 'cross_sum';
}

export type CustomDSL = WeightedSumDSL | XorDSL | CrossSumDSL;

function parseCustomDSL(functionBody: string): CustomDSL {
  let parsed: unknown;
  try {
    parsed = JSON.parse(functionBody);
  } catch {
    throw new Error('Custom check function must be a valid JSON DSL expression');
  }

  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('Custom DSL must have a "type" field');
  }

  const obj = parsed as Record<string, unknown>;

  switch (obj.type) {
    case 'weighted_sum': {
      if (!Array.isArray(obj.weights) || obj.weights.length === 0) {
        throw new Error('weighted_sum requires a non-empty "weights" array');
      }
      if (!obj.weights.every((w: unknown) => typeof w === 'number' && Number.isFinite(w))) {
        throw new Error('weighted_sum weights must be finite numbers');
      }
      if (typeof obj.mod !== 'number' || obj.mod < 2 || obj.mod > 256) {
        throw new Error('weighted_sum "mod" must be a number between 2 and 256');
      }
      return {
        type: 'weighted_sum',
        weights: obj.weights as number[],
        mod: obj.mod,
        complement: obj.complement === true,
      };
    }
    case 'xor':
      return { type: 'xor' };
    case 'cross_sum':
      return { type: 'cross_sum' };
    default:
      throw new Error(`Unknown custom DSL type: "${obj.type}". Supported: weighted_sum, xor, cross_sum`);
  }
}

function executeCustomDSL(input: string, dsl: CustomDSL): string {
  const digits = input.split('').map((c) => {
    const n = parseInt(c, 36); // supports 0-9, A-Z
    if (isNaN(n)) return 0;
    return n;
  });

  switch (dsl.type) {
    case 'weighted_sum': {
      let sum = 0;
      for (let i = 0; i < digits.length; i++) {
        sum += digits[i] * dsl.weights[i % dsl.weights.length];
      }
      const remainder = sum % dsl.mod;
      const result = dsl.complement ? (dsl.mod - remainder) % dsl.mod : remainder;
      return String(result);
    }
    case 'xor': {
      let result = 0;
      for (const d of digits) {
        result ^= d;
      }
      return String(result);
    }
    case 'cross_sum': {
      let value = digits.reduce((a, b) => a + b, 0);
      while (value >= 10) {
        value = String(value).split('').reduce((a, c) => a + parseInt(c, 10), 0);
      }
      return String(value);
    }
  }
}

export async function customCalculate(
  input: string,
  functionBody: string,
): Promise<string> {
  const dsl = parseCustomDSL(functionBody);
  return executeCustomDSL(input, dsl);
}

export async function customValidate(
  input: string,
  checkDigit: string,
  functionBody: string,
): Promise<boolean> {
  const calculated = await customCalculate(input, functionBody);
  return calculated === checkDigit;
}
