import { MetaApiError, MetaErrorCode } from "./types";

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
    error_user_msg?: string;
  };
}

/**
 * Maps a Graph API error response to a normalized MetaApiError.
 * Reference: https://developers.facebook.com/docs/marketing-api/error-reference
 */
export function mapGraphError(httpStatus: number, body: unknown): MetaApiError {
  const err = (body as GraphErrorBody)?.error ?? {};
  const code = err.code ?? 0;
  const subcode = err.error_subcode ?? 0;
  const rawMessage = err.error_user_msg || err.message || "Meta API error";

  let mapped: MetaErrorCode = "UNKNOWN";
  let retryable = false;

  if (code === 190) {
    mapped = "TOKEN_EXPIRED";
  } else if (code === 4 || code === 17 || code === 613 || code === 80000 || code === 80004 || subcode === 2446079) {
    mapped = "RATE_LIMITED";
    retryable = true;
  } else if (code === 100 && subcode === 1487293) {
    mapped = "BUDGET_TOO_LOW";
  } else if (code === 100) {
    mapped = "INVALID_PARAMETER";
  } else if (code === 200 || code === 10 || code === 294 || code === 3 || subcode === 1349220) {
    mapped = "PERMISSION_DENIED";
  } else if (code === 1487742 || err.type === "policy_violation") {
    mapped = "POLICY_VIOLATION";
  } else if (code === 803 || httpStatus === 404) {
    mapped = "NOT_FOUND";
  } else if (code === 1 || code === 2 || httpStatus >= 500) {
    mapped = "TEMPORARY";
    retryable = true;
  }

  return new MetaApiError(rawMessage, mapped, code, subcode, httpStatus, retryable);
}
