export interface UserResponse {
  id: string;
  username: string;
  role: string;
  accessToken?: string | null;
  telegramId?: number | null;
  group?: string | null;
}

export interface ScheduleEntry {
  name: string;
  days: Day[];
}

export interface Day {
  name: string;
  date: string;
  street?: string | null;
  lessons: Lesson[];
}

export interface Lesson {
  name?: string | null;
  group?: string | null;
  range?: number[] | null;
  type: LessonType;
  time: LessonBoundaries;
  subgroups?: (LessonSubGroup | null)[] | null;
}

export enum LessonType {
  DEFAULT,
  ADDITIONAL,
  BREAK,
  CONSULTATION,
  INDEPENDENT_WORK,
  EXAM,
  EXAM_WITH_GRADE,
  EXAM_DEFAULT,
  COURSE_PROJECT,
  COURSE_PROJECT_DEFENSE,
  PRACTICE,
}

export interface LessonBoundaries {
  start: string;
  end: string;
}

export interface LessonSubGroup {
  teacher?: string | null;
  cabinet?: string | null;
}
