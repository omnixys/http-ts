import { HttpException } from "@nestjs/common";
import { ContextAccessor } from "@omnixys/context-ts";
import {
  FrameworkException,
  type FrameworkExceptionOptions,
  getErrorDefinition,
} from "@omnixys/contracts-ts";

export class FrameworkHttpException extends HttpException {
  readonly domainError: FrameworkException;

  constructor(
    code: string,
    message?: string,
    options: FrameworkExceptionOptions = {},
  ) {
    const context = ContextAccessor.get();
    const definition = getErrorDefinition(code);
    const domainError = new FrameworkException(
      code,
      message ?? definition.defaultMessage,
      {
        ...options,
        context:
          options.context ??
          (context
            ? {
                requestId: context.requestId,
                correlationId: context.correlationId,
                traceId: context.trace?.traceId,
                actorId: context.principal?.actorId,
                tenantId:
                  context.tenant?.tenantId ?? context.principal?.tenantId,
              }
            : undefined),
      },
    );
    super(domainError, domainError.httpStatus, {
      cause: options.cause instanceof Error ? options.cause : undefined,
    });
    this.domainError = domainError;
    Object.assign(this, {
      code: domainError.code,
      summary: domainError.summary,
      httpStatus: domainError.httpStatus,
      retryable: domainError.retryable,
      metadata: domainError.metadata,
      requestId: domainError.requestId,
      correlationId: domainError.correlationId,
      traceId: domainError.traceId,
    });
  }
}
