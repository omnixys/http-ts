import { HttpException } from "@nestjs/common";
import { ContextAccessor } from "@omnixys/context-ts";
import {
  ErrorCode,
  getErrorDefinition,
  getPublicErrorMetadata,
} from "@omnixys/contracts-ts";

export interface HttpErrorResponse {
  readonly statusCode: number;
  readonly code: string;
  readonly summary: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly service: string;
  readonly operation: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly traceId?: string;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface HttpErrorMappingOptions {
  readonly serviceName?: string;
  readonly operation?: string;
  readonly exposeInternalErrors?: boolean;
}

interface StructuredError {
  readonly code: string;
  readonly message: string;
  readonly summary?: string;
  readonly httpStatus?: number;
  readonly retryable?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly traceId?: string;
}

export function createHttpErrorResponse(
  error: unknown,
  options: HttpErrorMappingOptions = {},
): HttpErrorResponse {
  const context = ContextAccessor.get();
  const structured = structuredError(error);
  const httpException = error instanceof HttpException ? error : undefined;
  const status =
    structured?.httpStatus ??
    httpException?.getStatus() ??
    getErrorDefinition(ErrorCode.INTERNAL_SERVER_ERROR).httpStatus;
  const response = recordOf(httpException?.getResponse());
  const code =
    structured?.code ??
    stringOf(response?.code) ??
    codeForStatus(status, options.serviceName);
  const definition = getErrorDefinition(code);
  const rawMessage =
    structured?.message ??
    stringOf(response?.message) ??
    (error instanceof Error ? error.message : undefined);

  return Object.freeze({
    statusCode: status,
    code,
    summary:
      structured?.summary ?? stringOf(response?.summary) ?? definition.summary,
    message:
      options.exposeInternalErrors || status < 500
        ? (rawMessage ?? definition.defaultMessage)
        : definition.defaultMessage,
    retryable: structured?.retryable ?? definition.retryable,
    service: normalizeService(options.serviceName),
    operation:
      options.operation ?? context?.transport?.operation ?? "unknown",
    requestId:
      scopedId(structured?.requestId) ?? context?.requestId ?? "unscoped",
    correlationId:
      scopedId(structured?.correlationId) ??
      context?.correlationId ??
      context?.requestId ??
      "unscoped",
    traceId: scopedId(structured?.traceId) ?? context?.trace?.traceId,
    timestamp: new Date().toISOString(),
    metadata: sanitizePublicMetadata(
      getPublicErrorMetadata(
        code,
        structured?.metadata ?? recordOf(response?.metadata),
      ),
    ),
  });
}

function structuredError(value: unknown): StructuredError | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<StructuredError>;
  return typeof candidate.code === "string" &&
    typeof candidate.message === "string"
    ? (candidate as StructuredError)
    : undefined;
}

function codeForStatus(status: number, serviceName?: string): ErrorCode {
  if (status === 400) return ErrorCode.VALIDATION_ERROR;
  if (status === 401) return ErrorCode.UNAUTHENTICATED;
  if (status === 403) return ErrorCode.FORBIDDEN;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 409) return ErrorCode.CONFLICT;
  if (status === 429) return ErrorCode.RATE_LIMIT_EXCEEDED;
  if (status === 503) return ErrorCode.SERVICE_UNAVAILABLE;
  return internalCodeForService(serviceName);
}

function internalCodeForService(serviceName?: string): ErrorCode {
  const codes: Readonly<Record<string, ErrorCode>> = {
    analytics: ErrorCode.ANALYTICS_INTERNAL_ERROR,
    authentication: ErrorCode.AUTHENTICATION_INTERNAL_ERROR,
    blog: ErrorCode.BLOG_INTERNAL_ERROR,
    event: ErrorCode.EVENT_INTERNAL_ERROR,
    gateway: ErrorCode.GATEWAY_INTERNAL_ERROR,
    invitation: ErrorCode.INVITATION_INTERNAL_ERROR,
    notification: ErrorCode.NOTIFICATION_INTERNAL_ERROR,
    profile: ErrorCode.PROFILE_INTERNAL_ERROR,
    seat: ErrorCode.SEAT_INTERNAL_ERROR,
    "shopping-cart": ErrorCode.SHOPPING_CART_INTERNAL_ERROR,
    ticket: ErrorCode.TICKET_INTERNAL_ERROR,
    user: ErrorCode.USER_INTERNAL_ERROR,
  };
  return codes[normalizeService(serviceName)] ?? ErrorCode.INTERNAL_SERVER_ERROR;
}

function normalizeService(configured?: string): string {
  return (
    configured ??
    process.env.OTEL_SERVICE_NAME ??
    process.env.SERVICE ??
    process.env.SERVICE_NAME ??
    "unknown"
  )
    .replace(/^omnixys[-_]/, "")
    .replace(/[-_]service$/, "")
    .replace(/_/g, "-");
}

function sanitizePublicMetadata(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return sanitizeRecord(value, 0, new WeakSet<object>());
}

function sanitizeRecord(
  value: Readonly<Record<string, unknown>>,
  depth: number,
  seen: WeakSet<object>,
): Readonly<Record<string, unknown>> {
  if (seen.has(value)) return {};
  seen.add(value);
  const safe: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const sanitized = sanitizeValue(entry, depth + 1, seen);
    if (sanitized !== undefined) safe[key] = sanitized;
  }
  return Object.freeze(safe);
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > 5) return "[truncated]";
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) =>
      sanitizeValue(entry, depth + 1, seen),
    );
  }
  if (value && typeof value === "object") {
    return sanitizeRecord(
      value as Readonly<Record<string, unknown>>,
      depth,
      seen,
    );
  }
  return undefined;
}

const SENSITIVE_KEY =
  /(?:authorization|cookie|password|secret|token|credential|private.?key|api.?key|connection.?string)/i;

function recordOf(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function scopedId(value: string | undefined): string | undefined {
  return value && value !== "unscoped" ? value : undefined;
}
