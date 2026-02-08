import { config } from '../../../config/index.js';

/**
 * CUSTOM — Executes a sandboxed JavaScript function for check digit calculation.
 * Uses Node.js vm module with timeout.
 */
export async function customCalculate(
  input: string,
  functionBody: string,
): Promise<string> {
  const { runInNewContext } = await import('node:vm');

  const sandbox = { input, result: '' };
  const code = `result = (function(input) { ${functionBody} })(input);`;

  runInNewContext(code, sandbox, {
    timeout: config.customFunctionTimeoutMs,
  });

  return String(sandbox.result);
}

export async function customValidate(
  input: string,
  checkDigit: string,
  functionBody: string,
): Promise<boolean> {
  const calculated = await customCalculate(input, functionBody);
  return calculated === checkDigit;
}
