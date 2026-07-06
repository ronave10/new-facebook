import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load env from apps/api/.env or the repo root .env (native Node, no dotenv dep).
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(candidate);
    break;
  }
}

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { loadConfig } from "./core/config";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error"],
  });

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: [config.WEB_URL],
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(config.API_PORT);
  Logger.log(`CampaignOS API listening on :${config.API_PORT} (env=${config.NODE_ENV})`, "Bootstrap");
}

void bootstrap();
