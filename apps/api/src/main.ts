import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument, observeEnabled } from './app.module.js';

/** Creates the API host and listens on the configured port; startup failures propagate. */
async function bootstrap() {
  const options = observeEnabled ? { instrument: ObserveInstrument } : {};
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    options,
  );
  app.useBodyParser('json', { limit: '32kb' });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4040);
}

await bootstrap();
