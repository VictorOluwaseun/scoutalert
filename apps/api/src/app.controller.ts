import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

/** Exposes the API starter route through NestJS without owning business behavior. */
@Controller()
export class AppController {
  /** Receives the starter service through the application's dependency injection. */
  constructor(private readonly appService: AppService) {}

  /** Returns the starter response used to verify HTTP wiring. */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
