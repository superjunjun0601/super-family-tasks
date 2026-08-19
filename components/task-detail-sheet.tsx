"use client";

import { Check, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { childUserId, dadUserId, momUserId } from "@/lib/family-users";
import { maxCommentLength } from "@/lib/task-limits";
import { taskCategoryLabels, taskPriorityLabels } from "@/lib/task-labels";
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

type TaskDetailSheetProps = {
  currentUser: FamilyUser;
  isActionPending?: boolean;
  task: Task;
  onAddComment: (taskId: string, content: string) => void;
  onConfirmReward: (id: string) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onToggle: (id: string) => void;
};

export function TaskDetailSheet({
  currentUser,
  isActionPending = false,
  task,
  onAddComment,
  onConfirmReward,
  onClose,
  onDelete,
  onEdit,
  onToggle
}: TaskDetailSheetProps) {
  const ownerNames = getTaskOwnerNames(task);
  const compactForChild = currentUser.role === childUserId;
  const isDone = task.status === doneStatus;
  const isPending = task.status === pendingRewardStatus;
  const isOverdue = task.status !== doneStatus && (task.overdue || isPastDate(task.dueDate));
  const timeRangeLabel = getTaskTimeRangeLabel(task);
  const canManageTask = currentUser.role === momUserId || task.createdById === currentUser.id;
  const canConfirmReward = currentUser.role === momUserId || currentUser.role === dadUserId;
  const [commentText, setCommentText] = useState("");
  const detailTitleId = useId();

  return (
    <div className="fixed inset-0 z-30 flex justify-center bg-[rgba(36,48,47,0.24)] px-3 pt-10 backdrop-blur-sm">
      <section
        aria-labelledby={detailTitleId}
        aria-modal="true"
        className="bottom-sheet-safe mt-auto max-h-[88vh] w-[min(100%,430px)] overflow-y-auto rounded-t-[26px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_-18px_42px_rgba(61,50,36,0.18)]"
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[13px] text-[var(--muted)]">任务详情</p>
            <h2 className="text-[22px] font-extrabold leading-tight" id={detailTitleId}>{task.title}</h2>
          </div>
          <button
            aria-label="关闭详情"
            className="grid h-10 w-10 place-items-center rounded-[13px] border border-[var(--border)] bg-[#fffaf1]"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <div className={["task-card mb-4", isOverdue ? "task-card-overdue" : "", isPending ? "task-card-pending" : ""].join(" ")}>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--muted)]">{task.note}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {isOverdue ? <span className="chip chip-danger">逾期</span> : null}
            {isPending ? <span className="chip chip-magic">待爸爸/妈妈确认</span> : null}
            {!compactForChild ? <span className="chip chip-primary">{taskCategoryLabels[task.category]}</span> : null}
            {!compactForChild || task.priority !== normalPriority ? (
              <span className={task.priority === urgentPriority ? "chip chip-danger" : "chip"}>
                {taskPriorityLabels[task.priority]}
              </span>
            ) : null}
            {!compactForChild ? <span className="chip">负责人：{ownerNames}</span> : null}
            <span className="chip">完成时间：{timeRangeLabel}</span>
            {!compactForChild && task.remindLabel ? <span className="chip">提醒：{task.remindLabel}</span> : null}
            {!compactForChild && task.repeatLabel ? <span className="chip">{getRepeatDisplayLabel(task.repeatLabel, task.repeatUntil)}</span> : null}
            {(isDone || isPending) && task.completedBy ? (
              <span className="chip">完成：{task.completedBy.name} · {formatDateTimeLabel(task.completedAt)}</span>
            ) : null}
            {task.rewardStars ? <span className="chip chip-warm">奖励 {task.rewardStars} 朵</span> : null}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[rgba(255,250,241,0.72)] p-3.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-bold">评论</h3>
            <span className="text-[12px] text-[var(--muted)]">{task.comments?.length ?? 0} 条</span>
          </div>
          {task.comments?.length ? (
            <div className="mb-3 grid gap-2.5">
              {task.comments.map((comment) => (
                <div className="rounded-[13px] border border-[rgba(231,222,210,0.7)] bg-[rgba(255,253,248,0.78)] p-3" key={comment.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                    <strong className="text-[var(--text)]">{comment.author.name}</strong>
                    <span className="text-[var(--faint)]">{getCommentTimeLabel(comment)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--muted)]">
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-[14px] leading-relaxed text-[var(--muted)]">
              还没有评论，可以先留一句提醒或补充说明。
            </p>
          )}
          <form
            className="grid grid-cols-[1fr_auto] gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const content = commentText.trim();
              if (!content) return;
              onAddComment(task.id, content);
              setCommentText("");
            }}
          >
            <input
              aria-label="新增评论"
              className="h-11 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] outline-none"
              maxLength={maxCommentLength}
              placeholder={`${currentUser.name} 留一句`}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
            <button
              aria-label="发送评论"
              className="grid h-11 w-11 place-items-center rounded-xl border border-transparent bg-[var(--primary)] text-white disabled:opacity-45"
              disabled={!commentText.trim()}
              type="submit"
            >
              <Send size={17} />
            </button>
          </form>
        </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              className={[
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white disabled:bg-[#c9c7bf]",
                !canManageTask && !(isPending && canConfirmReward) ? "col-span-2" : ""
              ].join(" ")}
              disabled={isActionPending}
            onClick={() => (isPending && canConfirmReward ? onConfirmReward(task.id) : onToggle(task.id))}
            type="button"
          >
            {isDone || isPending ? <RotateCcw size={17} /> : <Check size={17} />}
            {isDone
              ? "恢复未完成"
              : isPending && canConfirmReward
                ? task.rewardStars
                  ? `确认并发 ${task.rewardStars} 朵`
                  : "确认完成"
                : isPending
                  ? "恢复未完成"
                  : "完成任务"}
          </button>
          {isPending && canConfirmReward ? (
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[#fffaf1] font-bold text-[var(--text)] disabled:opacity-45"
              disabled={isActionPending}
              onClick={() => onToggle(task.id)}
              type="button"
            >
              <RotateCcw size={17} />
              恢复未完成
            </button>
          ) : null}
          {canManageTask ? (
            <button
              className={[
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[#fffaf1] font-bold text-[var(--text)]",
                isPending && canConfirmReward ? "col-span-2" : ""
              ].join(" ")}
              onClick={() => onEdit(task)}
              type="button"
            >
              <Pencil size={17} />
              编辑
            </button>
          ) : null}
          {canManageTask ? (
            <button
              className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#f5c6bd] bg-[#fde7e2] font-bold text-[#9f332b]"
              onClick={() => onDelete(task.id)}
              type="button"
            >
              <Trash2 size={17} />
              删除到回收站
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
