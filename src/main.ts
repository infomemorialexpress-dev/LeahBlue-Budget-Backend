import cors from 'cors';
import express from 'express';
import { connectDB } from './config/db';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();

const allowedOrigins = Array.from(
  new Set(
    [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'https://leah-blue-budget.vercel.app',
      process.env.FRONTEND_URL,
      process.env.CORS_ORIGIN,
    ]
      .filter((origin): origin is string => Boolean(origin))
      .map((origin) => origin.trim().replace(/\/+$/, '')),
  ),
);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'LeahBlue Budget API is running' });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

async function bootstrap(): Promise<void> {
  app.listen(PORT, () => {
    console.log(`Server running in ${env.nodeEnv} mode on port ${PORT}`);
    console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });

  await connectDB();
}

bootstrap();
