export const momUserId = "mom";
export const dadUserId = "dad";
export const childUserId = "child";

export const familyUsers = [
  { id: momUserId, name: "妈妈", role: momUserId },
  { id: dadUserId, name: "爸爸", role: dadUserId },
  { id: childUserId, name: "小柚子", role: childUserId }
];

export const familyUserIds = familyUsers.map((user) => user.id);
export const familyUserNamesById = Object.fromEntries(familyUsers.map((user) => [user.id, user.name]));
