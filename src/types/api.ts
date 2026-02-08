export interface ValidateRequest {
  code: string;
  project_id: string;
  ow_user_id?: string;
  ow_transaction_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidateCheckQuery {
  code: string;
  project_id: string;
}

export interface ListCodesQuery {
  project_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ApiErrorResponse {
  status: 'KO';
  error_code: string;
  error_message: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessResponse {
  status: 'OK';
  code: string;
  code_normalized: string;
  project: { id: string; name: string };
  code_rule: { id: string; name: string };
  product_info: unknown;
  campaign_info: unknown;
  redeemed_at: string;
  redemption_id: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
