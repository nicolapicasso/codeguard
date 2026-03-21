export interface StructureDefinition {
  segments: Segment[];
}

export interface BaseSegment {
  name: string;
  length: number;
  description?: string;
}

export interface FixedSegment extends BaseSegment {
  type: 'fixed';
  value: string;
}

export interface NumericSegment extends BaseSegment {
  type: 'numeric';
  min?: number;
  max?: number;
}

export interface AlphaSegment extends BaseSegment {
  type: 'alpha';
  case?: 'upper' | 'lower' | 'both';
}

export interface AlphanumericSegment extends BaseSegment {
  type: 'alphanumeric';
}

export interface CheckSegment extends BaseSegment {
  type: 'check';
  algorithm: string;
  appliesTo: string[];
}

export interface DateSegment extends BaseSegment {
  type: 'date';
  format: string;
}

export interface EnumSegment extends BaseSegment {
  type: 'enum';
  values: string[];
}

/**
 * HMAC authenticator segment — cryptographic proof of code origin.
 *
 * SECURITY: This is the key anti-forgery mechanism for codes that are NOT
 * pre-stored. The fabricant generates a truncated HMAC over the payload
 * segments using a shared secret (stored in the CodeRule). OmniCodex verifies
 * the HMAC to prove the code was genuinely emitted by the fabricant.
 *
 * Without this segment, anyone who understands the rule structure could
 * fabricate valid codes. With it, only the holder of the secret key can
 * generate codes that pass validation.
 *
 * @property appliesTo - Names of segments whose values are HMAC'd
 * @property secret_ref - Reference to the secret stored in CodeRule.fabricantSecret
 */
export interface HmacSegment extends BaseSegment {
  type: 'hmac';
  appliesTo: string[];
}

export type Segment =
  | FixedSegment
  | NumericSegment
  | AlphaSegment
  | AlphanumericSegment
  | CheckSegment
  | DateSegment
  | EnumSegment
  | HmacSegment;
