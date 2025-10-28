import {Telegraf} from 'telegraf';
import type {Context} from 'telegraf';
import * as Sentry from '@sentry/node';
import {config} from './config';
import {BotError, buildScheduleMessage, ScheduleTarget} from './scheduleService';

const sentryDsn = config.sentryDsn ?? undefined;
const isSentryEnabled = Boolean(sentryDsn);

if (isSentryEnabled && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0,
  });
}

function captureError(error: unknown): void {
  if (isSentryEnabled) {
    Sentry.captureException(error);
  }
}

const bot = new Telegraf(config.telegramBotToken, {
  handlerTimeout: 10_000,
});

async function handleScheduleCommand(ctx: Context, target: ScheduleTarget) {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    await ctx.reply('Не удалось определить пользователя.');
    return;
  }

  try {
    const {messageText} = await buildScheduleMessage(telegramId, target);
    await ctx.reply(messageText, {parse_mode: 'HTML'});
  } catch (error) {
    const message = error instanceof BotError
      ? error.displayMessage
      : 'Произошла непредвиденная ошибка. Попробуйте еще раз позже.';

    if (!(error instanceof BotError)) {
      console.error('Unhandled command error', error);
      captureError(error);
    }

    await ctx.reply(message);
  }
}

bot.command('today', async (ctx) => {
  await handleScheduleCommand(ctx, 'today');
});

bot.command('tomorrow', async (ctx) => {
  await handleScheduleCommand(ctx, 'tomorrow');
});

bot.on('inline_query', async (ctx) => {
  const telegramId = ctx.inlineQuery.from.id;

  try {
    const {title, description, messageText} = await buildScheduleMessage(telegramId, 'today');

    await ctx.answerInlineQuery(
      [
        {
          type: 'article',
          id: `schedule-${Date.now()}`,
          title,
          description,
          input_message_content: {
            message_text: messageText,
            parse_mode: 'HTML',
          },
        },
      ],
      {
        cache_time: 0,
        is_personal: true,
      }
    );
  } catch (error) {
    const message = error instanceof BotError
      ? error.displayMessage
      : 'Произошла непредвиденная ошибка. Попробуйте еще раз позже.';

    if (!(error instanceof BotError)) {
      console.error('Unhandled inline query error', error);
      captureError(error);
    }

    await ctx.answerInlineQuery(
      [
        {
          type: 'article',
          id: `error-${Date.now()}`,
          title: 'Не удалось получить расписание',
          description: message,
          input_message_content: {
            message_text: message,
          },
        },
      ],
      {
        cache_time: 0,
        is_personal: true,
      }
    );
  }
});

bot.catch((err, ctx) => {
  console.error('Unhandled bot error', err, 'for update', ctx.update);
  captureError(err);
});

bot.launch()
  .then(() => {
    console.log('Telegram inline bot is running.');
  })
  .catch((error) => {
    console.error('Failed to launch the bot', error);
    captureError(error);
    process.exit(1);
  });

function stopBot(signal: NodeJS.Signals): void {
  if (isSentryEnabled) {
    void Sentry.close(2000).finally(() => bot.stop(signal));
  } else {
    bot.stop(signal);
  }
}

process.once('SIGINT', () => stopBot('SIGINT'));
process.once('SIGTERM', () => stopBot('SIGTERM'));
