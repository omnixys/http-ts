import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
  Optional,
} from "@nestjs/common";
import {
  createHttpErrorResponse,
  type HttpErrorMappingOptions,
} from "./http-error.mapper.js";
import { HTTP_ERROR_OPTIONS } from "./http.constants.js";

interface HttpReply {
  status(code: number): HttpReply;
  send(payload: unknown): unknown;
}

@Catch()
export class FrameworkHttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Optional()
    @Inject(HTTP_ERROR_OPTIONS)
    private readonly options: HttpErrorMappingOptions = {},
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== "http") throw exception;
    const response = createHttpErrorResponse(exception, this.options);
    host
      .switchToHttp()
      .getResponse<HttpReply>()
      .status(response.statusCode)
      .send(response);
  }
}
