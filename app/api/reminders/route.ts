import { NextResponse } from "next/server";
import { unauthorizedError } from "@/lib/api-error-codes";
import { childUserId } from "@/lib/family-users";
import { findFamilyUser, getCurrentUserId } from "@/lib/server-auth";
import { listVisibleTasks } from "@/lib/server-task-store";
import { getReminderSettings } from "@/lib/server-user-store";
import { dueSoonReminderType, overdueReminderType, rewardPendingReminderType } from "@/lib/reminder-types";
import { isTaskOwner } from "@/lib/task-helpers";
import { shouldRemindToday } from "@/lib/task-time-label";
import { doneStatus, pendingRewardStatus } from "@/lib/task-values";

export async function GET(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const currentUser = findFamilyUser(currentUserId);
  if (!currentUser) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const reminderSettings = await getReminderSettings(currentUserId);
  if (!reminderSettings?.siteRemindersEnabled) return NextResponse.json({ reminders: [] });

  const reminders = (await listVisibleTasks(currentUserId))
    .filter((task) => task.status === pendingRewardStatus || (task.status !== doneStatus && (task.overdue || shouldRemindToday(task))))
    .filter((task) => {
      if (task.status === pendingRewardStatus) {
        return reminderSettings.rewardRemindersEnabled && currentUser.role !== childUserId;
      }
      if (task.overdue && !reminderSettings.overdueRemindersEnabled) return false;
      return isTaskOwner(task, currentUser.id);
    })
    .map((task) => ({
      id: `reminder-${task.id}`,
      taskId: task.id,
      title: task.title,
      type: task.status === pendingRewardStatus ? rewardPendingReminderType : task.overdue ? overdueReminderType : dueSoonReminderType,
      dueLabel: task.dueLabel
    }));

  return NextResponse.json({ reminders });
}
