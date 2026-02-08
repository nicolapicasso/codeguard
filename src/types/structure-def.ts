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

export type Segment =
  | FixedSegment
  | NumericSegment
  | AlphaSegment
  | AlphanumericSegment
  | CheckSegment
  | DateSegment
  | EnumSegment;
