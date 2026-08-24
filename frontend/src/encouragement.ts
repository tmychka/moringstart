// What to say to someone looking at their own todo list.
//
// The first version of this file held sixty-four written-out phrases and dealt
// one per hour. It read as what it was: a stranger's aphorism, picked from a
// bag. Nothing in it knew anything about the person reading it, so there was
// nothing in it to believe.
//
// This version says almost nothing of its own. It reads the list and the
// completion log and reports what is actually there — how many days running you
// have closed something, how this week compares to last, which task you have
// been carrying for three weeks. The sentences around the numbers are written
// here; the numbers are yours, and they are what does the work. Every note
// carries the source it was read from, so any claim can be checked against the
// list rather than taken on faith.
//
// Alongside the number sits one plain warm line — the two do different jobs.
// The note is the evidence and the phrase is the part that says it is fine
// either way, which no amount of evidence can say on its own.

import { addDays, startOfWeek } from "./dashboardStats";
import { days, daysSince, plural, s, tasks, times } from "./plural";
import { toKey } from "./stepsUtil";
import {
  formatMinutes,
  todayLoad,
  type CompletionLog,
  type Todo,
} from "./todos";

/** Anything said here is said in both languages. */
export interface Phrase {
  ua: string;
  en: string;
}

/** One true thing about this list, read off the data rather than written. */
export interface Note extends Phrase {
  /** Short label for what it was read from — keeps the claim checkable. */
  source: string;
  /** How much this deserves the slot right now; the highest few are shown. */
  weight: number;
}

// --- language ----------------------------------------------------------------

const closed = (n: number) => plural(n, "закрита", "закриті", "закритих");

// Long titles would push the number — the part worth reading — off the line.
const name = (title: string): string =>
  `«${title.length > 30 ? `${title.slice(0, 29)}…` : title}»`;
const nameEn = (title: string): string =>
  `"${title.length > 30 ? `${title.slice(0, 29)}…` : title}"`;

// --- reading the log ---------------------------------------------------------

const on = (log: CompletionLog, day: Date): number => log[toKey(day)] ?? 0;

/** Completions over `length` days starting at `from`. */
const across = (log: CompletionLog, from: Date, length: number): number => {
  let total = 0;
  for (let d = 0; d < length; d++) total += on(log, addDays(from, d));
  return total;
};

/**
 * This calendar week so far, and the whole week before it.
 *
 * Calendar weeks rather than the last seven days against the seven before:
 * "this week" has to mean the week you are actually in, or the comparison
 * shifts by a day every day and Monday morning reads as a collapse. The current
 * week is only as long as it has got, which is why the two are also returned
 * with the days each covers — comparing three days against seven and calling it
 * a drop would be the same lie in a different shape.
 */
const weekPair = (log: CompletionLog, now: Date) => {
  const thisMonday = startOfWeek(now);
  const lastMonday = addDays(thisMonday, -7);
  // Monday is day one of the week, not day zero.
  const elapsed = ((now.getDay() + 6) % 7) + 1;

  return {
    elapsed,
    thisWeek: across(log, thisMonday, elapsed),
    lastWeek: across(log, lastMonday, 7),
    lastWeekSoFar: across(log, lastMonday, elapsed),
  };
};

/**
 * Consecutive days ending today on which something was closed.
 *
 * A day that is still going does not break a run: at nine in the morning you
 * have not failed to close anything yet, so the count starts at yesterday when
 * today is still empty. That is the difference between a streak that encourages
 * and one that resets itself every midnight to punish you.
 */
const streakOf = (log: CompletionLog, now: Date): number => {
  let streak = 0;
  for (let d = on(log, now) ? 0 : 1; d < 400; d++) {
    if (!on(log, addDays(now, -d))) break;
    streak++;
  }
  return streak;
};

/** The best single day in the last `window` days, today excluded. */
const bestBefore = (log: CompletionLog, now: Date, window: number): number => {
  let best = 0;
  for (let d = 1; d <= window; d++)
    best = Math.max(best, on(log, addDays(now, -d)));
  return best;
};

// --- the observations --------------------------------------------------------

// Thresholds, named rather than buried in the conditions below. Each one is the
// point where a number stops being noise and starts being worth mentioning.
const STREAK_MIN = 2;
const AGING_DAYS = 5;
const HABIT_RUNS = 5;
const MILESTONE_STEP = 50;

/**
 * Everything true about this list right now, each with a weight. Nothing here
 * decides what gets shown — that is the panel's job — so a note can be added
 * without touching the ordering.
 */
export function observe(
  todos: Todo[],
  log: CompletionLog,
  now: Date = new Date()
): Note[] {
  const notes: Note[] = [];
  const load = todayLoad(todos, now);
  const open = todos.filter((todo) => !todo.done);

  // --- what the log knows ---

  const streak = streakOf(log, now);
  if (streak >= STREAK_MIN) {
    notes.push({
      ua: `${streak} ${days(streak)} поспіль ти щось закривав.`,
      en: `${streak} ${s(streak, "day")} running, you've closed something.`,
      source: "журнал виконаних",
      weight: 40 + streak * 6,
    });
  }

  const week = weekPair(log, now);
  if (week.thisWeek > 0 && week.lastWeek > 0) {
    // Judged against the same stretch of last week, not against all of it: on
    // a Tuesday, three closed is ahead of last Tuesday even though it is well
    // behind last week's total, and it is the first of those that is news.
    const up = week.thisWeek >= week.lastWeekSoFar;
    notes.push({
      ua: up
        ? `Цього тижня — ${week.thisWeek} ${closed(week.thisWeek)}. Минулого за ці ж дні — ${week.lastWeekSoFar}.`
        : `Цього тижня — ${week.thisWeek}, минулого за ці ж дні — ${week.lastWeekSoFar}. Темп теж має право падати.`,
      en: up
        ? `${week.thisWeek} closed this week. Same days last week, ${week.lastWeekSoFar}.`
        : `${week.thisWeek} closed this week, against ${week.lastWeekSoFar} over the same days last week. Pace is allowed to dip.`,
      source: "цей і минулий тиждень",
      weight: up ? 45 : 20,
    });
  }

  const todayCount = on(log, now);
  const best = bestBefore(log, now, 30);
  if (todayCount > 0 && todayCount > best) {
    notes.push({
      ua: `${todayCount} за сьогодні — твій найкращий день за місяць.`,
      en: `${todayCount} today — your best day in a month.`,
      source: "рекорд за 30 днів",
      weight: 85,
    });
  }

  const total = Object.values(log).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    const round = total % MILESTONE_STEP === 0;
    notes.push({
      ua: `Разом ти закрив ${total} ${tasks(total)}.`,
      en: `${total} ${s(total, "task")} closed in total.`,
      source: "за весь час",
      weight: round ? 75 : 18,
    });
  }

  // --- what today looks like ---

  if (load.done === 1 && load.open > 0) {
    notes.push({
      ua: "Перша за сьогодні зроблена. Найважче вже позаду.",
      en: "First one done today. The hard part is behind you.",
      source: "сьогодні",
      weight: 55,
    });
  }

  if (load.done > 0 && load.open === 0) {
    notes.push({
      ua: `Сьогодні закрито все — ${load.done} ${plural(load.done, "штука", "штуки", "штук")}.`,
      en: `Everything closed today — ${load.done} of ${s(load.done, "them")}.`,
      source: "сьогодні",
      weight: 90,
    });
  }

  if (load.open > 0 && load.minutes > 0) {
    notes.push({
      ua: `На сьогодні лишилось ≈${formatMinutes(load.minutes)} на ${load.open} ${tasks(load.open)}.`,
      en: `About ${formatMinutes(load.minutes)} left today across ${load.open} ${s(load.open, "task")}.`,
      source: "оцінки на сьогодні",
      weight: 15,
    });
  }

  // --- what the list is carrying ---

  const oldest = open
    .filter((todo) => daysSince(todo.created, now) >= AGING_DAYS)
    .sort((a, b) => a.created - b.created)[0];
  if (oldest) {
    const age = daysSince(oldest.created, now);
    notes.push({
      ua: `${name(oldest.title)} з тобою вже ${age} ${days(age)}. Зроби або викресли — обидва варіанти кращі за третій.`,
      en: `${nameEn(oldest.title)} has been with you ${age} ${s(age, "day")}. Do it or drop it — either beats carrying it.`,
      source: "найстаріша відкрита",
      weight: 25 + Math.min(age, 30),
    });
  }

  const habit = open
    .filter((todo) => todo.repeat && todo.runs >= HABIT_RUNS)
    .sort((a, b) => b.runs - a.runs)[0];
  if (habit) {
    notes.push({
      ua: `${name(habit.title)} — ${habit.runs} ${times(habit.runs)}. Це вже звичка, а не спроба.`,
      en: `${nameEn(habit.title)} — ${habit.runs} ${s(habit.runs, "time")}. That's a habit now, not an attempt.`,
      source: "повторювані",
      weight: 50,
    });
  }

  const late = open
    .filter((todo) => todo.due !== null && toKey(now) > todo.due)
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  if (late.length) {
    notes.push({
      ua: `${late.length} ${plural(late.length, "прострочена", "прострочені", "прострочених")}. Візьми одну — решта від цього стане меншою.`,
      en: `${late.length} overdue. Take one — the rest shrinks from that alone.`,
      source: "прострочені",
      weight: 30,
    });
  }

  // --- nothing to report yet ---

  if (!notes.length) {
    notes.push(
      todos.length
        ? {
            ua: "Поки що тут тихо. Закрий щось — і буде що порахувати.",
            en: "Quiet so far. Close something and there'll be a number here.",
            source: "порожній журнал",
            weight: 1,
          }
        : {
            ua: "Список порожній. Одне речення — і день має форму.",
            en: "The list is empty. One line, and the day has a shape.",
            source: "порожній список",
            weight: 1,
          }
    );
  }

  return notes.sort((a, b) => b.weight - a.weight);
}

// --- rotation ----------------------------------------------------------------

/** How many of the strongest notes are kept in the rotation. */
const IN_ROTATION = 4;

/**
 * Which note to show. The strongest few rotate by the hour, so the panel says
 * something different through the day without ever dropping to a weak note
 * while a strong one is available.
 *
 * A record set at two in the afternoon shows immediately rather than waiting
 * for the top of the hour, because it outweighs everything else in the pool.
 */
export function noteFor(notes: Note[], now: Date, nudge = 0): Note {
  const pool = notes.slice(0, IN_ROTATION);
  return pool[(now.getHours() + nudge) % pool.length];
}

// --- what it says alongside --------------------------------------------------

// Plain, warm, second person. These are the one part of the panel that is not
// read off the data, and they are deliberately short: a number tells you how you
// are doing, and this tells you that it is fine either way. No attribution and
// no philosophy — nobody needs Seneca at nine in the morning.
const PHRASES: Phrase[] = [
  { ua: "Ти красавчик.", en: "You're a star." },
  {
    ua: "Як би не було важко — рухайся далі.",
    en: "However hard it gets, keep moving.",
  },
  { ua: "Ти сильний. Ти класний.", en: "You're strong. You're beautiful." },
  { ua: "Все ок. Ти на правильному шляху.", en: "It's fine. You're on track." },
  { ua: "Я в тебе вірю.", en: "I believe in you." },
  {
    ua: "Ти справляєшся краще, ніж думаєш.",
    en: "You're doing better than you think.",
  },
  { ua: "Не здавайся. Серйозно.", en: "Don't give up. Seriously." },
  {
    ua: "Ти вже далеко зайшов. Не зупиняйся.",
    en: "You've come a long way. Keep going.",
  },
  { ua: "Сьогодні буде добрий день.", en: "Today's going to be a good one." },
  {
    ua: "Ти молодець. Просто знай це.",
    en: "You're doing great. Just know it.",
  },
  {
    ua: "Погані дні бувають у всіх. Це не про тебе.",
    en: "Everyone has bad days. It says nothing about you.",
  },
  { ua: "Дихай. Все встигнеш.", en: "Breathe. There's time." },
  { ua: "Ти не один.", en: "You're not alone." },
  {
    ua: "Крок за кроком — і буде результат.",
    en: "Step by step, and it adds up.",
  },
  {
    ua: "Ти робиш більше, ніж помічаєш.",
    en: "You do more than you notice.",
  },
  { ua: "Пишаюся тобою.", en: "Proud of you." },
  {
    ua: "Втомився — відпочинь. Це нормально.",
    en: "Tired? Rest. That's allowed.",
  },
  { ua: "Ти вартий хорошого.", en: "You deserve good things." },
  {
    ua: "Не порівнюй себе з іншими. У тебе свій темп.",
    en: "Don't measure yourself against anyone. Your pace is yours.",
  },
  {
    ua: "Сьогодні ти вже спробував. Цього достатньо.",
    en: "You showed up today. That's enough.",
  },
  {
    ua: "Все вийде. Не зараз — то потім.",
    en: "It'll work out. If not now, then later.",
  },
  { ua: "Ти сильніший, ніж здається.", en: "You're stronger than you look." },
  { ua: "Тримайся. Найважче минає.", en: "Hang in there. The worst passes." },
  {
    ua: "Ти вже змінився на краще.",
    en: "You've already changed for the better.",
  },
  {
    ua: "Помилки — це нормально. Йди далі.",
    en: "Mistakes are fine. Keep going.",
  },
  { ua: "Твоя праця не марна.", en: "None of your work is wasted." },
  {
    ua: "Просто зроби одну річ. Цього вистачить.",
    en: "Just do one thing. That will do.",
  },
  { ua: "Ти впораєшся. Як завжди.", en: "You'll handle it. You always do." },
  { ua: "Все, що ти робиш, має сенс.", en: "Everything you do counts." },
  { ua: "Гарного тобі дня. Справді.", en: "Have a good day. Genuinely." },
];

/** FNV-1a, used only to turn a day into a number to deal from. */
const hash = (seed: string): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** mulberry32 — seeded, so a day's order is the same on every visit. */
const generator = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

// Fisher-Yates. The deck is dealt once per day and walked one step per hour,
// rather than hashing the hour directly: hashing draws with replacement, so it
// lands on the same line two hours running often enough to look broken.
const shuffled = <T>(list: T[], seed: string): T[] => {
  const random = generator(hash(seed));
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export function phraseFor(now: Date = new Date(), nudge = 0): Phrase {
  const deck = shuffled(PHRASES, `${toKey(now)}:phrase`);
  return deck[(now.getHours() + nudge) % deck.length];
}
