/** 一条用户活动记录（页面加载 / 心跳） */
export interface ActivityPoint {
  userId: string;
  userName: string;
  at: Date;
}

export interface UserUsage {
  userId: string;
  userName: string;
  /** 会话数（按 gap 合并后） */
  sessions: number;
  /** 累计使用时长（毫秒） */
  durationMs: number;
}

const MS_PER_MIN = 60 * 1000;
/** 默认会话合并间隔：30 分钟（对齐领导面板口径） */
export const DEFAULT_SESSION_GAP_MS = 30 * MS_PER_MIN;

/**
 * 按用户把活动点切分为会话并计算时长。
 * 同一用户相邻活动间隔 > gapMs 视为新会话；
 * 单次会话时长 = 会话内末次 - 首次活动时间（单点会话为 0）。
 */
export function computeUserUsage(
  points: ActivityPoint[],
  gapMs: number = DEFAULT_SESSION_GAP_MS,
): UserUsage[] {
  const byUser = new Map<string, ActivityPoint[]>();
  for (const p of points) {
    const arr = byUser.get(p.userId);
    if (arr) arr.push(p);
    else byUser.set(p.userId, [p]);
  }

  const result: UserUsage[] = [];
  for (const [userId, arr] of byUser.entries()) {
    arr.sort((a, b) => a.at.getTime() - b.at.getTime());
    let sessions = 0;
    let durationMs = 0;
    let sessionStart = arr[0].at.getTime();
    let prev = arr[0].at.getTime();

    for (let i = 1; i < arr.length; i++) {
      const cur = arr[i].at.getTime();
      if (cur - prev > gapMs) {
        // 上一会话结束
        sessions += 1;
        durationMs += prev - sessionStart;
        sessionStart = cur;
      }
      prev = cur;
    }
    // 收尾最后一个会话
    sessions += 1;
    durationMs += prev - sessionStart;

    result.push({
      userId,
      userName: arr[arr.length - 1].userName,
      sessions,
      durationMs,
    });
  }

  return result.sort((a, b) => b.sessions - a.sessions);
}

/**
 * 计算指定时刻所在"今天"起点之后的会话数。
 * 复用 computeUserUsage 的会话切分逻辑，仅统计会话起点 >= todayStart 的会话。
 */
export function countTodaySessions(
  points: ActivityPoint[],
  todayStart: Date,
  gapMs: number = DEFAULT_SESSION_GAP_MS,
): number {
  const byUser = new Map<string, number[]>();
  for (const p of points) {
    const arr = byUser.get(p.userId);
    if (arr) arr.push(p.at.getTime());
    else byUser.set(p.userId, [p.at.getTime()]);
  }
  const todayMs = todayStart.getTime();
  let count = 0;
  for (const times of byUser.values()) {
    times.sort((a, b) => a - b);
    let sessionStart = times[0];
    let prev = times[0];
    for (let i = 1; i < times.length; i++) {
      if (times[i] - prev > gapMs) {
        if (sessionStart >= todayMs) count += 1;
        sessionStart = times[i];
      }
      prev = times[i];
    }
    if (sessionStart >= todayMs) count += 1;
  }
  return count;
}

export function msToMinutes(ms: number): number {
  return Math.round((ms / MS_PER_MIN) * 10) / 10;
}
