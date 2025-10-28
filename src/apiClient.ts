import axios from 'axios';
import { config } from './config';
import { ScheduleEntry, UserResponse } from './types';

const api = axios.create({
  baseURL: config.apiBaseUrl,
  headers: {
    Authorization: `Bearer ${config.apiJwt}`,
  },
});

export async function getUserByTelegramId(telegramId: number): Promise<UserResponse> {
  const { data } = await api.get<UserResponse>(`/api/v1/users/by/telegram-id/${telegramId}`);
  return data;
}

export async function getScheduleByGroupName(groupName: string): Promise<ScheduleEntry> {
  const encoded = encodeURIComponent(groupName);
  const { data } = await api.get<ScheduleEntry>(`/api/v1/schedule/group/${encoded}`);
  return data;
}
