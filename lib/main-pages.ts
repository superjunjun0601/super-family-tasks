export const homePage = "home";
export const listPage = "list";
export const babyPage = "baby";
export const mePage = "me";
export const settingsPage = "settings";
export const trashPage = "trash";
export const remindersPage = "reminders";

export const mainPages = [
  homePage,
  listPage,
  babyPage,
  mePage,
  settingsPage,
  trashPage,
  remindersPage
] as const;

export type MainPage = (typeof mainPages)[number];
