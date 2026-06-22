import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { Logger } from './common/logger.js';
import { JwtAuthMiddleware } from './common/decorators/jwt-auth.js';
import { initializeEventProcessing } from './infrastructure/events/index.js';

const logger = new Logger('main');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Protect API endpoints while keeping /health public.
  app.use('/api', JwtAuthMiddleware());

  // Setup Swagger documentation
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Time-Off Service API')
      .setDescription('Production-grade Time-Off Microservice for ExampleHR')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(process.env.SWAGGER_PATH || '/api/docs', app, document);
    logger.log(`Swagger documentation available at ${process.env.SWAGGER_PATH || '/api/docs'}`);
  }

  // Initialize event processing
  await initializeEventProcessing();

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');

  logger.log(`✅ Application is running on http://localhost:${port}`);
  logger.log(`🏥 Health check available at http://localhost:${port}/health`);
}

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap application', error);
  process.exit(1);
});
