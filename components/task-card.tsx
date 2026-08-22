"use client";

import { Check, Sparkles } from "lucide-react";
import { dadUserId, momUserId } from "@/lib/family-users";
import { taskPriorityLabels } from "@/lib/task-labels";
import { doneStatus, normalPriority, pendingRewardStatus, urgentPriority } from "@/lib/task-values";
import { getTaskOwnerNames } from "@/lib/task-helpers";
import {
  formatDateTimeLabel,
  getCommentTimeLabel,
  getRepeatDisplayLabel,
  getTaskTimeRangeLabel,
  isPastDate
} from "@/lib/task-time-label";
import type { FamilyUser, Task } from "@/lib/types";

type TaskCardProps = {
  compactForChild?: boolean;
  currentUser?: FamilyUser;
  isActionPending?: boolean;
  task: Task;
  onConfirmReward?: (id: string) => void;
  onOpen?: (id: string) => void;
  onToggle?: (id: string) => void;
};

export function TaskCard({
  compactForChild = false,
  currentUser,
  isActionPending = false,
  task,
  onConfirmReward,
  onOpen,
  onToggle
}: TaskCardProps) {
  const ownerNames = getTaskOwnerNames(task);
  const isDone = task.status === doneStatus;
  const isPending = task.status === pendingRewardStatus;
  const isOverdue = task.status !== doneStatus && (task.overdue || isPastDate(task.dueDate));
  const canConfirmReward = currentUser ? currentUser.role === momUserId || currentUser.role === dadUserId : true;
  const showChildDetails = compactForChild;
  const timeRangeLabel = getTaskTimeRangeLabel(task);
  const visibleComments = task.comments ?? [];

  return (
    <article
      className={[
        "task-card relative overflow-hidden",
        onOpen ? "cursor-pointer" : "",
        isOverdue ? "task-card-overdue" : "",
        isPending ? "task-card-pending" : "",
        isDone ? "opacity-70" : ""
      ].join(" ")}
      onClick={() => onOpen?.(task.id)}
    >
      {onOpen ? (
        <button
          className="sr-only"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(task.id);
          }}
          type="button"
        >
          查看任务详情：{task.title}
        </button>
      ) : null}
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div>
          <h3
            className={[
              "mb-1.5 text-[16px] font-bold leading-snug",
              isDone ? "text-[var(--muted)] line-through decoration-[var(--primary)] decoration-2" : ""
            ].join(" ")}
          >
            {task.title}
          </h3>
          <p
            className={[
              "whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--muted)]",
              isDone ? "line-through decoration-[rgba(102,115,111,0.55)]" : ""
            ].join(" ")}
          >
            {task.note}
          </p>
        </div>
        <button
          aria-label={isDone || isPending ? "恢复未完成" : "完成任务"}
          className={[
            "grid h-[30px] w-[30px] place-items-center rounded-[10px] border disabled:opacity-45",
            isDone
              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
              : isPending
                ? "border-[#ddd2ff] bg-[#eee8ff] text-[#5d42ae]"
              : "border-[var(--border)] bg-[#fffaf1] text-transparent"
          ].join(" ")}
          disabled={isActionPending}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.(task.id);
          }}
          type="button"
        >
          <Check size={17} strokeWidth={3} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {isDone ? <span className="chip chip-primary">已完成</span> : null}
        {isOverdue ? <span className="chip chip-danger">逾期</span> : null}
        {isPending ? <span className="chip chip-magic">等待确认</span> : null}
        {!showChildDetails || task.priority !== normalPriority ? (
          <span className={task.priority === urgentPriority ? "chip chip-danger" : "chip chip-primary"}>
            {taskPriorityLabels[task.priority]}
          </span>
        ) : null}
        {!showChildDetails ? <span className="chip">负责人：{ownerNames}</span> : null}
        <span className="chip">完成时间：{timeRangeLabel}</span>
        {!showChildDetails && task.repeatLabel ? <span className="chip">{getRepeatDisplayLabel(task.repeatLabel, task.repeatUntil)}</span> : null}
        {!showChildDetails && (isDone || isPending) && task.completedBy ? (
          <span className="chip">完成：{task.completedBy.name} · {formatDateTimeLabel(task.completedAt)}</span>
        ) : null}
        {task.rewardStars ? (
          <span className="chip chip-warm">奖励 {task.rewardStars} 朵</span>
        ) : null}
      </div>

      {visibleComments.length ? (
        <div className="mt-3 grid gap-2 border-t border-[rgba(231,222,210,0.72)] pt-3">
          {visibleComments.map((comment) => (
            <div
              className="rounded-[12px] bg-[rgba(255,250,241,0.76)] px-3 py-2"
              key={comment.id}
            >
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[12px]">
                <strong className="text-[var(--text)]">{comment.author.name}</strong>
                <span className="flex-none text-[var(--faint)]">{getCommentTimeLabel(comment)}</span>
              </div>
              <p
                className={[
                  "whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--muted)]",
                  isDone ? "line-through decoration-[rgba(102,115,111,0.45)]" : ""
                ].join(" ")}
              >
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {isPending && canConfirmReward ? (
        <div
          className="mt-3 rounded-[14px] border border-[#ddd2ff] bg-[linear-gradient(135deg,#f5f0ff,#fff4dc)] p-3"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-start gap-2">
            <div className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-[#eee8ff] text-[#5d42ae]">
              <Sparkles size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-[#5d42ae]">小柚子已完成，等待爸爸/妈妈确认</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--muted)]">
                {task.rewardStars ? `确认后发放 ${task.rewardStars} 朵彩虹花。` : "确认后任务会正式完成。"}
              </p>
            </div>
          </div>
          <button
            className="h-11 w-full rounded-xl border border-[#9a7bea] bg-[#9a7bea] font-bold text-white disabled:opacity-45"
            disabled={isActionPending}
            onClick={(event) => {
              event.stopPropagation();
              onConfirmReward?.(task.id);
            }}
            type="button"
          >
            {task.rewardStars ? `确认并发 ${task.rewardStars} 朵` : "确认完成"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
