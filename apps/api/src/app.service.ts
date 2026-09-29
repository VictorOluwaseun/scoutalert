import { Injectable } from '@nestjs/common';

/** Supplies the starter response until product use cases are composed into the API. */
@Injectable()
export class AppService {
  /** Returns the deterministic greeting exercised by starter unit and HTTP tests. */
  getHello(): string {
    return 'Hello World!';
  }
}
