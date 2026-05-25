import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { json, urlencoded } from 'express';
import { config as loadEnv } from 'dotenv';

const envCandidates = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '..', '.env'),
  join(process.cwd(), '..', '..', '.env'),
  join(process.cwd(), 'apps', 'api', '.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
    break;
  }
}

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

  const hasInterviewBase = Boolean(process.env.INTERVIEW_BASE_URL?.trim());
  const hasInterviewKey = Boolean(process.env.INTERVIEW_API_KEY?.trim());
  const interviewModel = process.env.INTERVIEW_MODEL?.trim() || 'gpt-4o-mini';
  console.log(
    `[resume-agent-api] env loaded: INTERVIEW_BASE_URL=${hasInterviewBase ? 'yes' : 'no'}, INTERVIEW_API_KEY=${hasInterviewKey ? 'yes' : 'no'}, INTERVIEW_MODEL=${interviewModel}`,
  );

  await app.listen(port);
  console.log(`[resume-agent-api] listening on http://localhost:${port}`);
}

void bootstrap();
