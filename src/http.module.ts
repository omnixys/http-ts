import { type DynamicModule, Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { FrameworkHttpExceptionFilter } from "./http-exception.filter.js";
import type { HttpErrorMappingOptions } from "./http-error.mapper.js";
import { HTTP_ERROR_OPTIONS } from "./http.constants.js";

export { HTTP_ERROR_OPTIONS } from "./http.constants.js";

@Global()
@Module({})
export class OmnixysHttpModule {
  static forRoot(options: HttpErrorMappingOptions = {}): DynamicModule {
    return {
      module: OmnixysHttpModule,
      providers: [
        { provide: HTTP_ERROR_OPTIONS, useValue: options },
        FrameworkHttpExceptionFilter,
        {
          provide: APP_FILTER,
          useExisting: FrameworkHttpExceptionFilter,
        },
      ],
      exports: [FrameworkHttpExceptionFilter],
    };
  }
}
