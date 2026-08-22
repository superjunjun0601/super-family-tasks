"use client";

import { ChevronLeft, ChevronRight, Mic, X } from "lucide-react";
import { useId, useState } from "react";
import {
  addDays,
  getTodayDate,
  getTodayInputValue,
  parseInputDate,
  toInputDate
} from "@/lib/calendar-utils";
import { childUserId, familyUsers } from "@/lib/family-users";
import { maxReminderDays, maxRewardStars, minReminderDays, taskNoteMaxLength, taskTitleMaxLength } from "@/lib/task-limits";
import { taskCategoryOptions, taskPriorityOptions } from "@/lib/task-labels";
import { formatDateLabel, getReminderLabel, getRepeatLabel, repeatWeekdayOptions } from "@/lib/task-time-label";
import { seriesTaskUpdateScope, singleTaskUpdateScope, type TaskUpdateScope } from "@/lib/task-update-scope";
import { childStudyCategory, familyCategory, normalPriority } from "@/lib/task-values";
import type { FamilyUser, Priority, Task, TaskCategory, TaskDraft } from "@/lib/types";

const reminderOptions = [
  { days: minReminderDays, label: "不提醒" },
  ...Array.from({ length: maxReminderDays }, (_, index) => {
    const days = index + 1;
    return { days, label: getReminderLabel(days) };
  })
];

type TaskFormSheetProps = {
  currentUser: FamilyUser;
  initialDraft?: TaskDraft;
  initialTask?: Task;
  mode: "create" | "edit";
  onClose: () => void;
  onQuickCreate?: () => void;
  onSubmit: (draft: TaskDraft, updateScope?: TaskUpdateScope) => void;
};

export function TaskFormSheet({ currentUser, initialDraft, initialTask, mode, onClose, onQuickCreate, onSubmit }: TaskFormSheetProps) {
  const isChildUser = currentUser.role === childUserId;
  const [title, setTitle] = useState(initialTask?.title ?? initialDraft?.title ?? "");
  const [note, setNote] = useState(initialTask?.note ?? initialDraft?.note ?? "");
  const defaultCategory: TaskCategory = isChildUser ? childStudyCategory : familyCategory;
  const [category, setCategory] = useState<TaskCategory>(
    isChildUser ? childStudyCategory : initialTask?.category ?? initialDraft?.category ?? defaultCategory
  );
  const [ownerIds, setOwnerIds] = useState<string[]>(
    isChildUser ? [childUserId] : initialTask?.owners.map((owner) => owner.id) ?? initialDraft?.ownerIds ?? [currentUser.id]
  );
  const [priority, setPriority] = useState<Priority>(initialTask?.priority ?? initialDraft?.priority ?? normalPriority);
  const [taskDate, setTaskDate] = useState(initialTask?.taskDate ?? initialDraft?.taskDate ?? "");
  const [dueDate, setDueDate] = useState(initialTask?.dueDate ?? initialDraft?.dueDate ?? "");
  const [reminderDays, setReminderDays] = useState<number | undefined>(
    initialTask?.reminderDays ?? initialDraft?.reminderDays
  );
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(
    initialTask?.repeatWeekdays ?? initialDraft?.repeatWeekdays ?? []
  );
  const [repeatUntil, setRepeatUntil] = useState(initialTask?.repeatUntil ?? initialDraft?.repeatUntil ?? "");
  const [updateScope, setUpdateScope] = useState<TaskUpdateScope>(singleTaskUpdateScope);
  const [openPicker, setOpenPicker] = useState<"taskTime" | "dueTime" | "reminder" | "repeat" | "repeatUntil" | null>(null);
  const [rewardStars, setRewardStars] = useState(String(initialTask?.rewardStars ?? initialDraft?.rewardStars ?? ""));
  const formTitleId = useId();
  const hasChildOwner = ownerIds.includes(childUserId);
  const fallbackTaskTimeLabel = initialTask?.taskTimeLabel ?? initialDraft?.taskTimeLabel ?? "";
  const fallbackDueLabel = initialTask?.dueLabel ?? initialDraft?.dueLabel ?? "";
  const fallbackRemindLabel = initialTask?.remindLabel ?? initialDraft?.remindLabel ?? "";
  const fallbackRepeatLabel = initialTask?.repeatLabel ?? initialDraft?.repeatLabel ?? "";
  const taskTimeLabel = formatDateLabel(taskDate) || fallbackTaskTimeLabel;
  const dueLabel = formatDateLabel(dueDate) || fallbackDueLabel;
  const repeatUntilLabel = formatDateLabel(repeatUntil);
  const canEditReward = hasChildOwner && currentUser.role !== childUserId;
  const remindLabel =
    typeof reminderDays === "number"
      ? getReminderLabel(reminderDays)
      : fallbackRemindLabel;
  const repeatLabel = repeatWeekdays.length ? getRepeatLabel(repeatWeekdays) : fallbackRepeatLabel;
  const dateRangeIsValid = !taskDate || !dueDate || taskDate <= dueDate;
  const repeatUntilIsValid = !repeatWeekdays.length || !repeatUntil || !taskDate || repeatUntil >= taskDate;
  const canChooseUpdateScope = Boolean(
    !isChildUser &&
      mode === "edit" &&
      initialTask &&
      (initialTask.repeatWeekdays?.length || initialTask.repeatSeriesId || initialTask.repeatGeneratedFromId)
  );
  const canSubmit = Boolean(
    title.trim() &&
      taskDate &&
      dueDate &&
      taskTimeLabel.trim() &&
      dueLabel.trim() &&
      ownerIds.length &&
      dateRangeIsValid &&
      repeatUntilIsValid
  );

  function toggleOwner(userId: string) {
    setOwnerIds((current) => {
      if (current.includes(userId)) {
        const next = current.filter((id) => id !== userId);
        if (userId === childUserId && next.length) {
          setRewardStars("");
          setCategory(familyCategory);
        }
        return next.length ? next : current;
      }
      if (userId === childUserId) setCategory(childStudyCategory);
      return [...current, userId];
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[rgba(36,48,47,0.24)] px-3 pt-10 backdrop-blur-sm">
      <form
        aria-labelledby={formTitleId}
        aria-modal="true"
        className="bottom-sheet-safe mt-auto max-h-[90vh] w-[min(100%,430px)] overflow-y-auto rounded-t-[26px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_-18px_42px_rgba(61,50,36,0.18)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          const draft: TaskDraft = {
            title: title.trim(),
            note: note.trim(),
            category: isChildUser ? childStudyCategory : category,
            ownerIds: isChildUser ? [childUserId] : ownerIds,
            priority,
            taskTimeLabel: taskTimeLabel || undefined,
            taskDate: taskDate || undefined,
            dueLabel: dueLabel.trim(),
            dueDate: dueDate || undefined,
            remindLabel: remindLabel || undefined,
            reminderDays,
            repeatLabel: repeatLabel.trim() || undefined,
            repeatWeekdays: repeatWeekdays.length ? repeatWeekdays : undefined,
            repeatUntil: repeatWeekdays.length && repeatUntil ? repeatUntil : undefined,
            rewardStars: !isChildUser && hasChildOwner && rewardStars ? Number(rewardStars) : undefined
          };
          onSubmit(draft, canChooseUpdateScope ? updateScope : singleTaskUpdateScope);
          }}
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[13px] text-[var(--muted)]">
              {mode === "create" ? "新建任务" : "编辑任务"}
            </p>
            <h2 className="text-[22px] font-extrabold leading-tight" id={formTitleId}>
              {mode === "create" ? (isChildUser ? "新增小柚子任务" : "新增家庭任务") : "调整任务内容"}
            </h2>
            {mode === "create" && onQuickCreate ? (
              <button
                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[rgba(79,157,143,0.28)] bg-[rgba(221,239,234,0.7)] px-2.5 text-[12px] font-bold text-[#1e655a]"
                onClick={onQuickCreate}
                type="button"
              >
                <Mic size={14} />
                一句话新建
              </button>
            ) : null}
          </div>
          <button
            aria-label="关闭表单"
            className="grid h-10 w-10 place-items-center rounded-[13px] border border-[var(--border)] bg-[#fffaf1]"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid gap-3.5">
          <Field label="标题" required>
            <input
              className="form-input"
              maxLength={taskTitleMaxLength}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field label="备注">
            <textarea
              className="form-input min-h-[92px] resize-none py-3 leading-relaxed"
              maxLength={taskNoteMaxLength}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          {!isChildUser ? (
            <Field label="分类">
              <select
                className="form-input select-input"
                value={category}
                onChange={(event) => {
                  const nextCategory = event.target.value as TaskCategory;
                  setCategory(nextCategory);
                  if (nextCategory === childStudyCategory) {
                    setOwnerIds((current) => (current.includes(childUserId) ? current : [...current, childUserId]));
                  } else {
                    setRewardStars("");
                    setOwnerIds((current) => {
                      const nextOwnerIds = current.filter((ownerId) => ownerId !== childUserId);
                      return nextOwnerIds.length ? nextOwnerIds : [currentUser.id];
                    });
                  }
                }}
              >
                {taskCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          ) : null}

          {!isChildUser ? (
            <div>
              <div className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-[var(--muted)]">
                负责人 <span className="text-[var(--danger)]">*</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {familyUsers.map((user) => (
                  <button
                    aria-pressed={ownerIds.includes(user.id)}
                    className={[
                      "min-h-10 rounded-xl border px-2 text-[14px] font-semibold",
                      ownerIds.includes(user.id)
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[#1e655a]"
                        : "border-[var(--border)] bg-[#fffaf1] text-[var(--muted)]"
                    ].join(" ")}
                    key={user.id}
                    onClick={() => toggleOwner(user.id)}
                    type="button"
                  >
                    {user.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={canEditReward ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
            <Field label="优先级">
              <select
                className="form-input select-input"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
              >
                {taskPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            {canEditReward ? (
              <Field label="彩虹花">
                <input
                  className="form-input"
                  inputMode="numeric"
                  min="1"
                  max={maxRewardStars}
                  value={rewardStars}
                  onChange={(event) => setRewardStars(clampNumericInput(event.target.value, maxRewardStars))}
                />
              </Field>
            ) : null}
          </div>

          <PickerButton
            label="任务时间"
            placeholder="选择任务日期"
            required
            value={taskTimeLabel}
            onClick={() => setOpenPicker("taskTime")}
          />

          <PickerButton
            label="最晚完成时间"
            placeholder="选择最晚完成日期"
            required
            value={dueLabel}
            onClick={() => setOpenPicker("dueTime")}
          />
          {!dateRangeIsValid ? (
            <p className="-mt-1 rounded-xl border border-[#f5c6bd] bg-[#fde7e2] px-3 py-2 text-[13px] font-bold text-[#9f332b]">
              最晚完成时间不能早于任务时间。
            </p>
          ) : null}

          {!isChildUser ? (
            <>
              <PickerButton
                label="提醒规则"
                placeholder="选择提前几天提醒"
                value={remindLabel}
                onClick={() => setOpenPicker("reminder")}
              />

              <PickerButton
                label="重复规则"
                placeholder="选择每周重复日期"
                value={repeatLabel}
                onClick={() => setOpenPicker("repeat")}
              />

              {repeatWeekdays.length ? (
                <PickerButton
                  label="重复结束日期"
                  placeholder="不填就是一直重复"
                  value={repeatUntilLabel}
                  onClick={() => setOpenPicker("repeatUntil")}
                />
              ) : null}
              {!repeatUntilIsValid ? (
                <p className="-mt-1 rounded-xl border border-[#f5c6bd] bg-[#fde7e2] px-3 py-2 text-[13px] font-bold text-[#9f332b]">
                  重复结束日期不能早于任务时间。
                </p>
              ) : null}
            </>
          ) : null}

          {canChooseUpdateScope ? (
            <div className="rounded-[14px] border border-[rgba(231,222,210,0.86)] bg-[rgba(255,250,241,0.72)] p-3">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--muted)]">修改范围</span>
              <div className="grid grid-cols-2 gap-2">
                <ScopeButton
                  active={updateScope === singleTaskUpdateScope}
                  description="只改这一天"
                  label="仅本次"
                  onClick={() => setUpdateScope(singleTaskUpdateScope)}
                />
                <ScopeButton
                  active={updateScope === seriesTaskUpdateScope}
                  description="同步未完成"
                  label="本次和后续"
                  onClick={() => setUpdateScope(seriesTaskUpdateScope)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <button
          className="mt-5 h-12 w-full rounded-xl border-0 bg-[var(--primary)] font-bold text-white disabled:opacity-45"
          disabled={!canSubmit}
          type="submit"
        >
          {mode === "create" ? (isChildUser ? "保存小柚子任务" : "保存任务") : "保存修改"}
        </button>
      </form>

      {openPicker === "taskTime" ? (
        <DatePickerSheet
          date={taskDate}
          title="任务时间"
          onClear={() => {
            setTaskDate("");
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
          onSave={(nextDate) => {
            setTaskDate(nextDate);
            if (dueDate && dueDate < nextDate) setDueDate(nextDate);
            if (repeatUntil && repeatUntil < nextDate) setRepeatUntil(nextDate);
            setOpenPicker(null);
          }}
        />
      ) : null}
      {openPicker === "dueTime" ? (
        <DatePickerSheet
          date={dueDate}
          minDate={taskDate || undefined}
          required
          title="最晚完成时间"
          onClear={() => {
            setDueDate("");
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
          onSave={(nextDate) => {
            setDueDate(nextDate);
            setOpenPicker(null);
          }}
        />
      ) : null}
      {openPicker === "reminder" ? (
        <ReminderPickerSheet
          reminderDays={reminderDays}
          onClose={() => setOpenPicker(null)}
          onSave={(nextDays) => {
            setReminderDays(nextDays);
            setOpenPicker(null);
          }}
        />
      ) : null}
      {openPicker === "repeat" ? (
        <RepeatPickerSheet
          selectedWeekdays={repeatWeekdays}
          onClose={() => setOpenPicker(null)}
          onSave={(nextWeekdays) => {
            setRepeatWeekdays(nextWeekdays);
            if (!nextWeekdays.length) setRepeatUntil("");
            setOpenPicker(null);
          }}
        />
      ) : null}
      {openPicker === "repeatUntil" ? (
        <DatePickerSheet
          date={repeatUntil}
          minDate={taskDate || undefined}
          title="重复结束日期"
          onClear={() => {
            setRepeatUntil("");
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
          onSave={(nextDate) => {
            setRepeatUntil(nextDate);
            setOpenPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PickerButton({
  label,
  onClick,
  placeholder,
  required,
  value
}: {
  label: string;
  onClick: () => void;
  placeholder: string;
  required?: boolean;
  value?: string;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-semibold text-[var(--muted)]">
        {label}
        {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
      </span>
      <button
        aria-label={`${label}：${value || placeholder}`}
        className={[
          "flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[#fffaf1] py-2 pl-3 pr-5 text-left outline-none",
          value ? "text-[var(--text)]" : "text-[#a0a6ae]"
        ].join(" ")}
        onClick={onClick}
        type="button"
      >
        <span className="min-w-0 flex-1">{value || placeholder}</span>
        <span className="flex-none text-xl leading-none text-[var(--faint)]">›</span>
      </button>
    </div>
  );
}

function DatePickerSheet({
  date,
  onClear,
  onClose,
  onSave,
  minDate,
  required,
  title
}: {
  date: string;
  onClear: () => void;
  onClose: () => void;
  onSave: (date: string) => void;
  minDate?: string;
  required?: boolean;
  title: string;
}) {
  const initialDate = getInitialDateValue(date, minDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => parseInputDate(initialDate));
  const calendarDays = getCalendarDays(visibleMonth);

  return (
    <PickerOverlay onClose={onClose} title={title}>
      <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(255,250,241,0.72)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            aria-label="上个月"
            className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
            onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
            type="button"
          >
            <ChevronLeft size={18} />
          </button>
          <strong className="text-[17px] leading-none">
            {visibleMonth.getFullYear()}年{visibleMonth.getMonth() + 1}月
          </strong>
          <button
            aria-label="下个月"
            className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
            onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
            type="button"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[12px] font-bold text-[var(--muted)]">
          {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => (
            <span className="py-1" key={weekday}>
              {weekday}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const isSelected = day.value === selectedDate;
            const isDisabled = minDate ? day.value < minDate : false;
            return (
              <button
                aria-current={day.isToday ? "date" : undefined}
                aria-label={`${isSelected ? "已选择" : "选择"}${formatDateLabel(day.value)}`}
                aria-pressed={isSelected}
                className={[
                  "grid aspect-square place-items-center rounded-[11px] text-[14px] font-bold transition-colors",
                  isDisabled
                    ? "cursor-not-allowed bg-[rgba(255,250,241,0.5)] text-[var(--faint)] opacity-45"
                    : isSelected
                    ? "bg-[var(--primary)] text-white shadow-[0_5px_14px_rgba(79,157,143,0.24)]"
                    : day.isToday
                      ? "bg-[var(--primary-soft)] text-[#1e655a]"
                      : day.inMonth
                        ? "bg-[var(--surface)] text-[var(--text)]"
                        : "bg-transparent text-[var(--faint)]"
                ].join(" ")}
                key={day.value}
                onClick={() => {
                  if (isDisabled) return;
                  setSelectedDate(day.value);
                }}
                disabled={isDisabled}
                type="button"
              >
                {day.day}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto">
          {getQuickDateOptions().map((option) => (
            <button
              aria-label={`${selectedDate === option.value ? "已选择" : "选择"}${option.label}，${formatDateLabel(option.value)}`}
              aria-pressed={selectedDate === option.value}
              className={[
                "h-9 flex-none rounded-full border px-3 text-[13px] font-bold",
                minDate && option.value < minDate
                  ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface)] text-[var(--faint)] opacity-45"
                  : selectedDate === option.value
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[#1e655a]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
              ].join(" ")}
              key={option.label}
              disabled={Boolean(minDate && option.value < minDate)}
              onClick={() => {
                if (minDate && option.value < minDate) return;
                setSelectedDate(option.value);
                setVisibleMonth(parseInputDate(option.value));
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          className="min-h-11 rounded-xl border border-[var(--border)] bg-[#fffaf1] font-bold text-[var(--text)] disabled:opacity-40"
          disabled={required}
          onClick={onClear}
          type="button"
        >
          清空
        </button>
        <button
          className="min-h-11 rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white"
          onClick={() => onSave(selectedDate)}
          type="button"
        >
          确定
        </button>
      </div>
    </PickerOverlay>
  );
}

function ReminderPickerSheet({
  reminderDays,
  onClose,
  onSave
}: {
  reminderDays?: number;
  onClose: () => void;
  onSave: (days: number | undefined) => void;
}) {
  const [selectedDays, setSelectedDays] = useState(reminderDays ?? maxReminderDays);

  return (
    <PickerOverlay onClose={onClose} title="提醒规则">
      <div className="grid gap-2.5">
        {reminderOptions.map((option) => (
          <button
            aria-pressed={selectedDays === option.days}
            className={[
              "min-h-12 rounded-xl border px-3 text-left font-bold",
              selectedDays === option.days
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[#1e655a]"
                : "border-[var(--border)] bg-[#fffaf1] text-[var(--text)]"
            ].join(" ")}
            key={option.days}
            onClick={() => setSelectedDays(option.days)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        className="mt-4 min-h-11 w-full rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white"
        onClick={() => onSave(selectedDays === 0 ? undefined : selectedDays)}
        type="button"
      >
        确定
      </button>
    </PickerOverlay>
  );
}

function RepeatPickerSheet({
  onClose,
  onSave,
  selectedWeekdays
}: {
  onClose: () => void;
  onSave: (weekdays: number[]) => void;
  selectedWeekdays: number[];
}) {
  const [nextWeekdays, setNextWeekdays] = useState(selectedWeekdays);

  function toggleWeekday(value: number) {
    setNextWeekdays((current) =>
      current.includes(value)
        ? current.filter((weekday) => weekday !== value)
        : [...current, value].sort((first, second) => first - second)
    );
  }

  return (
    <PickerOverlay onClose={onClose} title="重复规则">
      <div className="grid grid-cols-2 gap-2.5">
        {repeatWeekdayOptions.map((weekday) => (
          <button
            aria-pressed={nextWeekdays.includes(weekday.value)}
            className={[
              "min-h-12 rounded-xl border px-3 font-bold",
              nextWeekdays.includes(weekday.value)
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[#1e655a]"
                : "border-[var(--border)] bg-[#fffaf1] text-[var(--text)]"
            ].join(" ")}
            key={weekday.value}
            onClick={() => toggleWeekday(weekday.value)}
            type="button"
          >
            {weekday.label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          className="min-h-11 rounded-xl border border-[var(--border)] bg-[#fffaf1] font-bold text-[var(--text)]"
          onClick={() => onSave([])}
          type="button"
        >
          不重复
        </button>
        <button
          className="min-h-11 rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white"
          onClick={() => onSave(nextWeekdays)}
          type="button"
        >
          确定
        </button>
      </div>
    </PickerOverlay>
  );
}

function ScopeButton({
  active,
  description,
  label,
  onClick
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        "min-h-[58px] rounded-xl border px-3 py-2 text-left",
        active
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[#1e655a]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      <strong className="mb-0.5 block text-[14px] leading-snug">{label}</strong>
      <span className="block text-[12px] font-semibold leading-snug opacity-80">{description}</span>
    </button>
  );
}

function PickerOverlay({
  children,
  onClose,
  title
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[rgba(36,48,47,0.24)] px-3 pt-10 backdrop-blur-sm">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="bottom-sheet-safe mt-auto max-h-[86vh] w-[min(100%,430px)] overflow-y-auto rounded-t-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_-16px_36px_rgba(61,50,36,0.18)]"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[18px] font-extrabold leading-tight" id={titleId}>{title}</h3>
          <button
            aria-label="关闭选择器"
            className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[#fffaf1]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function addMonths(date: Date, monthOffset: number) {
  return new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
}

function getCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayBasedOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayBasedOffset);
  const todayValue = getTodayInputValue();

  return Array.from({ length: 42 }, (_, index) => {
    const currentDate = new Date(gridStart);
    currentDate.setDate(gridStart.getDate() + index);
    const value = toInputDate(currentDate);
    return {
      day: currentDate.getDate(),
      inMonth: currentDate.getMonth() === monthDate.getMonth(),
      isToday: value === todayValue,
      value
    };
  });
}

function getQuickDateOptions() {
  const today = getTodayDate();
  return [
    { label: "今天", value: toInputDate(today) },
    { label: "明天", value: toInputDate(addDays(today, 1)) },
    { label: "后天", value: toInputDate(addDays(today, 2)) }
  ];
}

function getInitialDateValue(date: string, minDate?: string) {
  const fallbackDate = date || getTodayInputValue();
  if (!minDate) return fallbackDate;
  if (!fallbackDate || fallbackDate < minDate) return minDate;
  return fallbackDate;
}

function clampNumericInput(value: string, max: number) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return String(Math.min(Number(digits), max));
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[13px] font-semibold text-[var(--muted)]">
        {label}
        {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
