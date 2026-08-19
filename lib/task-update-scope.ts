export const singleTaskUpdateScope = "single";
export const seriesTaskUpdateScope = "series";

export const taskUpdateScopes = [
  singleTaskUpdateScope,
  seriesTaskUpdateScope
] as const;

export type TaskUpdateScope = (typeof taskUpdateScopes)[number];
