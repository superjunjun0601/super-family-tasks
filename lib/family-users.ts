import type { FamilyUser, UserRole } from "@/lib/types";

export const momUserId = "mom" satisfies UserRole;
export const dadUserId = "dad" satisfies UserRole;
export const childUserId = "child" satisfies UserRole;

export const momUserName = "妈妈";
export const dadUserName = "爸爸";
export const childUserName = "小柚子";

export const familyUserIds = [
  momUserId,
  dadUserId,
  childUserId
] as const satisfies readonly UserRole[];

export const familyUsers: FamilyUser[] = [
  { id: momUserId, name: momUserName, role: momUserId },
  { id: dadUserId, name: dadUserName, role: dadUserId },
  { id: childUserId, name: childUserName, role: childUserId }
];

export const familyUserNamesById = Object.fromEntries(familyUsers.map((user) => [user.id, user.name]));
