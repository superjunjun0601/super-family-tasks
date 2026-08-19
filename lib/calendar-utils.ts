import { parseDateOnly } from "@/lib/date-utils";

export function getTodayDate() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function addDays(date: Date, dayOffset: number) {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + dayOffset);
  return nextDate;
}

export function toInputDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getNextWeekday(date: Date, targetWeekday: number) {
  const currentWeekday = date.getDay() === 0 ? 7 : date.getDay();
  const dayOffset = (targetWeekday - currentWeekday + 7) % 7;
  return addDays(date, dayOffset);
}

export function parseInputDate(date: string) {
  return parseDateOnly(date) ?? new Date();
}

export function getTodayInputValue() {
  return toInputDate(getTodayDate());
}
