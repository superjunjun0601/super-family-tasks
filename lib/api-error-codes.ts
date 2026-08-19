export const commentTooLongError = "COMMENT_TOO_LONG";
export const currentPasswordIncorrectError = "CURRENT_PASSWORD_INCORRECT";
export const emptyCommentError = "EMPTY_COMMENT";
export const invalidCredentialsError = "INVALID_CREDENTIALS";
export const invalidJsonBodyError = "INVALID_JSON_BODY";
export const invalidReminderSettingsError = "INVALID_REMINDER_SETTINGS";
export const invalidRepeatUntilError = "INVALID_REPEAT_UNTIL";
export const invalidTaskDateError = "INVALID_TASK_DATE";
export const invalidTaskDateRangeError = "INVALID_TASK_DATE_RANGE";
export const invalidTaskDraftError = "INVALID_TASK_DRAFT";
export const invalidTaskOwnersError = "INVALID_TASK_OWNERS";
export const noPermissionError = "NO_PERMISSION";
export const notEnoughFlowersError = "NOT_ENOUGH_FLOWERS";
export const passwordTooLongError = "PASSWORD_TOO_LONG";
export const passwordTooShortError = "PASSWORD_TOO_SHORT";
export const taskNotChildTaskError = "TASK_NOT_CHILD_TASK";
export const taskNotFoundError = "TASK_NOT_FOUND";
export const taskNotPendingRewardError = "TASK_NOT_PENDING_REWARD";
export const tooManyLoginAttemptsError = "TOO_MANY_LOGIN_ATTEMPTS";
export const unauthorizedError = "UNAUTHORIZED";
export const userNotFoundError = "USER_NOT_FOUND";

export const apiErrorCodes = [
  commentTooLongError,
  currentPasswordIncorrectError,
  emptyCommentError,
  invalidCredentialsError,
  invalidJsonBodyError,
  invalidReminderSettingsError,
  invalidRepeatUntilError,
  invalidTaskDateError,
  invalidTaskDateRangeError,
  invalidTaskDraftError,
  invalidTaskOwnersError,
  noPermissionError,
  notEnoughFlowersError,
  passwordTooLongError,
  passwordTooShortError,
  taskNotChildTaskError,
  taskNotFoundError,
  taskNotPendingRewardError,
  tooManyLoginAttemptsError,
  unauthorizedError,
  userNotFoundError
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];
