import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { urlencoded, json } from 'express';
import hpp from 'hpp';
import { SanitizePipe } from './common/pipes/sanitize.pipe';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // Tworzy aplikację Express na bazie NestJS
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // Buforuje logi zanim logger zostanie w pełni zainicjowany
  });

  // Logger zabezpieczony (np. nie loguje haseł itp.)
  // Służy do logowania requestów, błędów itd.
  app.useLogger(app.get(Logger));

  // Render, Netlify używają proxy — dzięki temu app zna poprawny adres IP użytkownika
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
  });

  // Ogranicza rozmiar danych w żądaniu (ochrona przed DoS)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // hpp - zabezpiecza przed HTTP Parameter Pollution (wielokrotne parametry)
  app.use(hpp());

  // helmet - ustawia bezpieczne nagłówki HTTP
  // (m.in. X-DNS-Prefetch-Control, X-Frame-Options, X-Content-Type-Options, itp.)
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // CORS - pozwala tylko określonym domenom na połączenia z backendem
  app.enableCors({
    origin: [
      'https://matchplaner.netlify.app',
      'https://matchplaner.onrender.com',
      'http://localhost:4200',
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Globalne "Pipes" - walidacja i sanityzacja danych
  app.useGlobalPipes(
    new SanitizePipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      skipUndefinedProperties: true,
      skipMissingProperties: true,
    }),
  );

  // Globalny "Filter" - obsługa wyjątków (centralny error handler)
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

  // Swagger - dokumentacja API (w trybie deweloperskim)
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MatchPlaner API')
      .setVersion('1.0')
      .build();

    const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDoc, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Uruchomienie serwera na porcie z ENV lub domyślnym 3000
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(` Server is running on port ${port}`);
}
bootstrap();
