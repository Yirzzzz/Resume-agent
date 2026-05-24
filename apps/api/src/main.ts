import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createServer } from 'node:net';
import { json, urlencoded } from 'express';

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

async function resolvePort(
  startPort: number,
  maxAttempts = 20,
): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset;
    // Try next port if current one is already taken.
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No available port found from ${startPort} to ${startPort + maxAttempts - 1}`,
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '6mb' }));
  app.use(urlencoded({ extended: true, limit: '6mb' }));

  app.enableCors({
    origin: true,
    credentials: false,
  });

  const preferredPort = Number(process.env.PORT ?? 3001);
  const port = await resolvePort(preferredPort);

  await app.listen(port);
  console.log(`[resume-agent-api] listening on http://localhost:${port}`);
}

void bootstrap();
