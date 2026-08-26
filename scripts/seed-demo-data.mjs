import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashSync } from "bcryptjs";
import { getDataDir } from "./data-dir.mjs";
import { familyUsers, momUserId, dadUserId, childUserId } from "./family-users.mjs";
import { petStoreFileName, taskStoreFileName, userStoreFileName } from "./data-files.mjs";
import { defaultReminderSettings } from "./reminder-settings.mjs";

const rootDir = process.cwd();
const dataDir = getDataDir(rootDir);
const demoPassword = process.env.SUPER_FAMILY_DEMO_PASSWORD?.trim() || "1234";
const now = new Date();
const nowIso = now.toISOString();

mkdirSync(dataDir, { recursive: true });

const taskStore = {
  tasks: createDemoTasks(),
  trashTasks: []
};

const userStore = {
  passwordHashes: Object.fromEntries(familyUsers.map((user) => [user.id, hashSync(demoPassword, 10)])),
  reminderSettings: Object.fromEntries(familyUsers.map((user) => [user.id, { ...defaultReminderSettings }]))
};

const petStore = {
  fedFlowers: 60,
  updatedAt: nowIso
};

writeJson(taskStoreFileName, taskStore);
writeJson(userStoreFileName, userStore);
writeJson(petStoreFileName, petStore);

console.log(`作品版演示数据已写入：${dataDir}`);
console.log(`妈妈、爸爸、小柚子的登录密码都是：${demoPassword}`);

function createDemoTasks() {
  const yesterday = addDays(-1);
  const today = addDays(0);
  const tomorrow = addDays(1);
  const dayAfter = addDays(2);
  const thisWeek = addDays(4);
  const thisMonth = addDays(10);
  const nextMonth = addDays(35);
  const lastWeek = addDays(-6);
  const recentPast = addDays(-3);

  return [
    createTask({
      id: "demo-overdue-english-video",
      title: "补拍英语视频作业",
      note: "周一课后的视频作业要在下一次英语课前提交，逾期补完后彩虹花奖励会减半。",
      createdById: momUserId,
      category: "child_study",
      ownerIds: [childUserId],
      priority: "urgent",
      taskDate: yesterday,
      dueDate: yesterday,
      remindLabel: "提前 1 天提醒",
      reminderDays: 1,
      repeatLabel: "每周一、周五课后",
      repeatWeekdays: [1, 5],
      rewardStars: 3,
      status: "todo",
      comments: [
        {
          id: "demo-comment-english",
          author: getUser(momUserId),
          content: "逾期了也没关系，补完也能拿到一半奖励。",
          createdAt: nowIso,
          createdAtLabel: "今天"
        }
      ]
    }),
    createTask({
      id: "demo-today-math",
      title: "数学口算 15 分钟",
      note: "做完以后自己检查一遍，错题圈出来。",
      createdById: momUserId,
      category: "child_study",
      ownerIds: [childUserId],
      priority: "important",
      taskDate: today,
      dueDate: today,
      rewardStars: 2,
      status: "todo"
    }),
    createTask({
      id: "demo-today-reading-done",
      title: "今天阅读 20 分钟",
      note: "今天已经完成的任务会保留在今天列表里，并用划线显示。",
      createdById: momUserId,
      category: "child_study",
      ownerIds: [childUserId],
      priority: "normal",
      taskDate: today,
      dueDate: today,
      rewardStars: 2,
      status: "done",
      completedBy: getUser(childUserId),
      completedAt: nowIso
    }),
    createTask({
      id: "demo-tomorrow-schoolbag",
      title: "整理明天上学书包",
      note: "检查课本、水杯、笔袋和英语贴纸。",
      createdById: dadUserId,
      category: "child_study",
      ownerIds: [childUserId],
      priority: "normal",
      taskDate: tomorrow,
      dueDate: tomorrow,
      rewardStars: 1,
      status: "todo"
    }),
    createTask({
      id: "demo-day-after-piano",
      title: "钢琴练习 30 分钟",
      note: "先练新曲子，再复习上周的曲子。",
      createdById: momUserId,
      category: "child_study",
      ownerIds: [childUserId],
      priority: "normal",
      taskDate: dayAfter,
      dueDate: dayAfter,
      rewardStars: 2,
      status: "todo"
    }),
    createTask({
      id: "demo-week-family-clean",
      title: "周末一起整理玩具柜",
      note: "爸爸妈妈和小柚子一起做，留下常玩的，收起暂时不用的。",
      createdById: momUserId,
      category: "family",
      ownerIds: [momUserId, dadUserId],
      priority: "normal",
      taskDate: thisWeek,
      dueDate: thisWeek,
      status: "todo"
    }),
    createTask({
      id: "demo-month-dentist",
      title: "预约儿童牙科复查",
      note: "确认周末是否有号，尽量约上午。",
      createdById: dadUserId,
      category: "family",
      ownerIds: [momUserId, dadUserId],
      priority: "important",
      taskDate: thisMonth,
      dueDate: thisMonth,
      status: "todo"
    }),
    createTask({
      id: "demo-after-month-trip",
      title: "准备秋游物品清单",
      note: "等学校通知出来后补充具体物品。",
      createdById: momUserId,
      category: "family",
      ownerIds: [momUserId],
      priority: "normal",
      taskDate: nextMonth,
      dueDate: nextMonth,
      status: "todo"
    }),
    createTask({
      id: "demo-past-earned-flowers-1",
      title: "上周完成：英语跟读",
      note: "用于展示小精灵已经积累的开心值，旧完成任务不会堆在今天列表。",
      createdById: momUserId,
      category: "child_study",
      ownerIds: [childUserId],
      priority: "normal",
      taskDate: lastWeek,
      dueDate: lastWeek,
      rewardStars: 32,
      status: "done",
      completedBy: getUser(childUserId),
      completedAt: lastWeek.toISOString()
    }),
    createTask({
      id: "demo-past-earned-flowers-2",
      title: "本周完成：主动整理错题",
      note: "旧完成任务仍然计入已获得彩虹花，但不会打乱小柚子的时间轴。",
      createdById: momUserId,
      category: "child_study",
      ownerIds: [childUserId],
      priority: "normal",
      taskDate: recentPast,
      dueDate: recentPast,
      rewardStars: 32,
      status: "done",
      completedBy: getUser(childUserId),
      completedAt: recentPast.toISOString()
    })
  ];
}

function createTask({
  id,
  title,
  note,
  createdById,
  category,
  ownerIds,
  priority,
  taskDate,
  dueDate,
  remindLabel,
  reminderDays,
  repeatLabel,
  repeatWeekdays,
  rewardStars,
  status,
  completedBy,
  completedAt,
  comments = []
}) {
  const taskTimeLabel = formatDateLabel(taskDate);
  const dueLabel =
    taskDate && dueDate && toDateOnly(taskDate) !== toDateOnly(dueDate)
      ? `${formatDateLabel(taskDate)} 到 ${formatDateLabel(dueDate)}`
      : formatDateLabel(dueDate);

  return {
    id,
    title,
    note,
    createdById,
    category,
    owners: ownerIds.map(getUser),
    priority,
    taskTimeLabel,
    taskDate: toDateOnly(taskDate),
    dueLabel,
    dueDate: toDateOnly(dueDate),
    remindLabel,
    reminderDays,
    repeatLabel,
    repeatWeekdays,
    rewardStars,
    status,
    completedBy,
    completedAt,
    overdue: status !== "done" && dueDate.getTime() < startOfToday().getTime(),
    comments
  };
}

function writeJson(fileName, value) {
  writeFileSync(join(dataDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function getUser(userId) {
  return familyUsers.find((user) => user.id === userId);
}

function addDays(days) {
  const date = startOfToday();
  date.setDate(date.getDate() + days);
  return date;
}

function startOfToday() {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}
