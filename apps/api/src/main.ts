import "reflect-metadata";
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
