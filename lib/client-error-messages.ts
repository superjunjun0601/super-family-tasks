import { ApiRequestError } from "@/lib/client-api";
import {
  currentPasswordIncorrectError,
  invalidRepeatUntilError,
  invalidTaskDateRangeError,
  invalidTaskDraftError,
  noPermissionError,
  notEnoughFlowersError,
  passwordTooLongError,
  passwordTooShortError
} from "@/lib/api-error-codes";
import { maxPasswordLength, minPasswordLength } from "@/lib/auth-values";

export function getLoginErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "身份或密码不对，请检查后再登录。";
    if (error.status === 429) return "密码连续输错太多次，请稍等 1 分钟再试。";
  }
  return "登录服务暂时没连上，请刷新页面后再试。";
}

export function getTaskSaveErrorMessage(error: unknown, fallback: string, isChildUser = false) {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (error.error === invalidTaskDateRangeError) return "最晚完成时间不能早于任务时间。";
  if (error.error === invalidRepeatUntilError) return "重复结束日期不能早于任务时间。";
  if (error.error === invalidTaskDraftError) {
    return isChildUser ? "任务信息不完整，请检查标题和日期。" : "任务信息不完整，请检查标题、负责人和日期。";
  }
  if (error.error === noPermissionError) return "当前账号没有权限修改这条任务。";
  return fallback;
}

export function getPasswordSaveErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.error === currentPasswordIncorrectError) return "当前密码不对，请重新输入。";
    if (error.error === passwordTooShortError) return `新密码至少需要 ${minPasswordLength} 位。`;
    if (error.error === passwordTooLongError) return `新密码最多 ${maxPasswordLength} 位。`;
  }
  return "密码保存失败，请稍后再试。";
}

export function getPetFeedErrorMessage(error: unknown) {
  return error instanceof ApiRequestError && error.error === notEnoughFlowersError
    ? "小红花不够啦，先完成任务攒一点。"
    : "喂小精灵失败，请稍后再试。";
}
