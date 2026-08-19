export const authChangePasswordApiPath = "/api/auth/change-password";
export const authLoginApiPath = "/api/auth/login";
export const authLogoutApiPath = "/api/auth/logout";
export const backupsApiPath = "/api/backups";
export const eventsApiPath = "/api/events";
export const healthApiPath = "/api/health";
export const meApiPath = "/api/me";
export const petApiPath = "/api/pet";
export const petFeedApiPath = "/api/pet/feed";
export const remindersApiPath = "/api/reminders";
export const settingsApiPath = "/api/settings";
export const tasksApiPath = "/api/tasks";
export const trashApiPath = "/api/trash";

export function taskApiPath(taskId) {
  return `${tasksApiPath}/${taskId}`;
}

export function taskCommentsApiPath(taskId) {
  return `${taskApiPath(taskId)}/comments`;
}

export function taskCompleteApiPath(taskId) {
  return `${taskApiPath(taskId)}/complete`;
}

export function taskConfirmRewardApiPath(taskId) {
  return `${taskApiPath(taskId)}/confirm-reward`;
}

export function taskRestoreApiPath(taskId) {
  return `${taskApiPath(taskId)}/restore`;
}

export function taskUncompleteApiPath(taskId) {
  return `${taskApiPath(taskId)}/uncomplete`;
}
