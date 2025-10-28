import axios from 'axios';
import {differenceInMinutes, format, isToday, isTomorrow, parseISO} from 'date-fns';
import {ru} from 'date-fns/locale';
import {getScheduleByGroupName, getUserByTelegramId} from './apiClient';
import {Day, Lesson, LessonSubGroup, LessonType, ScheduleEntry} from './types';

const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  [LessonType.DEFAULT]: 'Занятие',
  [LessonType.ADDITIONAL]: 'Дополнительное занятие',
  [LessonType.BREAK]: 'Перемена',
  [LessonType.CONSULTATION]: 'Консультация',
  [LessonType.INDEPENDENT_WORK]: 'Самостоятельная работа',
  [LessonType.EXAM]: 'Зачёт',
  [LessonType.EXAM_WITH_GRADE]: 'Зачёт с оценкой',
  [LessonType.EXAM_DEFAULT]: 'Экзамен',
  [LessonType.COURSE_PROJECT]: 'Курсовой проект',
  [LessonType.COURSE_PROJECT_DEFENSE]: 'Защита курсового проекта',
  [LessonType.PRACTICE]: 'Практика',
  [LessonType.DIFFERENTIATED_EXAM]: 'Дифференцированный зачёт',
};

export class BotError extends Error {
  constructor(message: string, public readonly displayMessage: string) {
    super(message);
    this.name = 'BotError';
  }
}

export interface ScheduleMessage {
  title: string;
  description: string;
  messageText: string;
}

export type ScheduleTarget = 'today' | 'tomorrow';

export async function buildScheduleMessage(telegramId: number, target: ScheduleTarget = 'today'): Promise<ScheduleMessage> {
  const user = await fetchUser(telegramId);

  if (!user.group) {
    throw new BotError(
      'Group is not assigned to the user.',
      'Не удалось определить вашу группу. Завершите регистрацию в Telegram-приложении.'
    );
  }

  const schedule = await fetchSchedule(user.group);
  const day = pickDay(schedule, target);

  if (!day) {
    const humanLabel = target === 'tomorrow' ? 'завтра' : 'сегодня';
    throw new BotError(
      target === 'tomorrow' ? 'No schedule for tomorrow.' : 'No schedule for today.',
      `На ${humanLabel} нет расписания.`
    );
  }

  const messageText = formatDayMessage(day, schedule.name);
  const description = buildDescription(day);
  const title = `${schedule.name} - ${formatDayTitle(day)}`;

  return {title, description, messageText};
}

async function fetchUser(telegramId: number) {
  try {
    return await getUserByTelegramId(telegramId);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new BotError(
        'Telegram user not found in API.',
        'Telegram-аккаунт не найден. Пройдите регистрацию в Telegram-приложении.'
      );
    }

    throw error;
  }
}

async function fetchSchedule(groupName: string) {
  try {
    return await getScheduleByGroupName(groupName);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 404) {
        throw new BotError(
          'Group schedule not found.',
          `Расписание для группы "${groupName}" не найдено.`
        );
      }
      if (status === 503) {
        throw new BotError(
          'Schedule not ready yet.',
          'Расписание пока не доступно. Попробуйте позже.'
        );
      }
    }

    throw error;
  }
}

function pickDay(schedule: ScheduleEntry, target: ScheduleTarget): Day | undefined {
  return schedule.days.find((day) => {
    const parsed = parseDayDate(day);
    if (!parsed) {
      return false;
    }
    return target === 'tomorrow' ? isTomorrow(parsed) : isToday(parsed);
  });
}

function parseDayDate(day: Day): Date | null {
  const parsed = parseISO(day.date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDayTitle(day: Day): string {
  const parsed = parseDayDate(day);
  if (!parsed) {
    return day.name;
  }

  return `${day.name}, ${format(parsed, 'd MMMM', {locale: ru})}`;
}

function formatDayMessage(day: Day, groupName: string): string {
  const headerParts = [`<b>${escapeHtml(groupName)}</b>`, escapeHtml(formatDayTitle(day))];
  if (day.street) {
    headerParts.push(escapeHtml(day.street));
  }

  const header = headerParts.join('\n');

  if (!day.lessons.length) {
    return `${header}\n\nНет занятий в этот день.`;
  }

  const lessonsText = day.lessons
    .map((lesson) => formatLesson(lesson))
    .filter(Boolean)
    .join('\n\n');

  return `${header}\n\n${lessonsText}`;
}

function buildDescription(day: Day): string {
  if (!day.lessons.length) {
    return 'Нет занятий в этот день';
  }

  return day.lessons
    .slice(0, 2)
    .map((lesson) => {
      const timeRange = formatTimeRange(lesson);
      const title = lesson.name ?? prettifyLessonType(lesson.type);
      return `${timeRange} ${title}`.trim();
    })
    .join('; ');
}

function formatLesson(lesson: Lesson): string {
  const timeRange = formatTimeRange(lesson);
  const title = lesson.name ?? prettifyLessonType(lesson.type);
  const typeNote = lesson.name ? lessonTypeSuffix(lesson.type) : '';

  const lessonIndex = lesson.range
    ? (lesson.range[0] === lesson.range[1]
      ? lesson.range[0]
      : `${lesson.range[0] - lesson.range[1]}`)
    : null;

  const lines = [];

  if (lessonIndex) {
    lines.push(
      `<b>${escapeHtml(`${lessonIndex}. ${timeRange}`)}</b> — ${escapeHtml(title)}${typeNote}`.trim(),
    );
  } else if (lesson.type === LessonType.BREAK) {
    const start = parseISO(lesson.time.start);
    const end = parseISO(lesson.time.end);

    const minutes = (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      ? null
      : Math.abs(differenceInMinutes(end, start));

    lines.push(
      `${escapeHtml(prettifyLessonType(lesson.type))}${minutes !== null ? ` — ${escapeHtml(String(minutes))} мин.` : ''}`.trim(),
    );
  } else {
    lines.push(
      `<b>${escapeHtml(`${timeRange}`)}</b> ${escapeHtml(title)}${typeNote}`.trim(),
    );
  }

  const detailLines = buildLessonDetails(lesson);
  if (detailLines) {
    lines.push(detailLines);
  }

  return lines.join('\n');
}

function lessonTypeSuffix(type: LessonType): string {
  if (type === LessonType.DEFAULT) {
    return '';
  }

  return ` <i>(${escapeHtml(prettifyLessonType(type))})</i>`;
}

function buildLessonDetails(lesson: Lesson): string {
  const parts: string[] = [];

  const subgroups = (lesson.subgroups ?? []).filter(Boolean) as LessonSubGroup[];
  if (subgroups.length) {
    subgroups.forEach((subgroup, index) => {
      const labelParts: string[] = [];
      if (subgroup.teacher) {
        labelParts.push(subgroup.teacher);
      }
      if (subgroup.cabinet) {
        labelParts.push(`каб. ${subgroup.cabinet}`);
      }
      if (labelParts.length) {
        const marker = subgroups.length > 1 ? ` (${index + 1} подгр.)` : '';
        parts.push(`• ${escapeHtml(labelParts.join(', '))}${marker}`);
      }
    });
  }

  if (lesson.group) {
    parts.push(`• ${escapeHtml(lesson.group)}`);
  }

  if (lesson.range && lesson.range[0] !== lesson.range[1]) {
    parts.push(`• c ${lesson.range[0]} по ${lesson.range[1]} пары`);
  }

  return parts.join('\n');
}

function formatTimeRange(lesson: Lesson): string {
  const start = parseISO(lesson.time.start);
  const end = parseISO(lesson.time.end);

  const startText = Number.isNaN(start.getTime()) ? lesson.time.start : format(start, 'HH:mm');
  const endText = Number.isNaN(end.getTime()) ? lesson.time.end : format(end, 'HH:mm');

  return `${startText}-${endText}`;
}

function prettifyLessonType(type: LessonType): string {
  return LESSON_TYPE_LABEL[type] ?? type;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
