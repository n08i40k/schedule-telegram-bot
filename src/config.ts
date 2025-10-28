import { config as loadEnv } from 'dotenv';

loadEnv();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:5050';
const API_JWT = process.env.API_JWT;
const SENTRY_DSN = process.env.SENTRY_DSN ?? null;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing. Set it in your environment or .env file.');
}

if (!API_JWT) {
  throw new Error('API_JWT is missing. Set it in your environment or .env file.');
}

export const config = {
  telegramBotToken: TELEGRAM_BOT_TOKEN,
  apiBaseUrl: API_BASE_URL,
  apiJwt: API_JWT,
  sentryDsn: SENTRY_DSN,
};
