/**
 * The chat: questions answered off the data, and entries taken as text.
 *
 * No model. Every answer is arithmetic over the same numbers the panels draw,
 * which is the whole point — a language model would phrase this more warmly and
 * would occasionally say "third week running" where the log says two. Here the
 * shape of what can be asked is smaller, and everything inside that shape is
 * exact.
 *
 * That bargain only holds if the limits are honest: when nothing matches, this
 * says so and lists what it does know, rather than guessing at an answer.
 */
import {
  addDays,
  currentStreak,
  lastNDays,
  parseSqlDate,
  startOfWeek,
} from "./dashboardStats";
import { kg, statusTotals, todaySpans } from "./jarvis";
import { dayNow, loadOfDay, progressOf, tickSet } from "./marathon";
import { topicBySlug } from "./developerTopics";
import { daysSince, days as dayWord, plural } from "./plural";
import { startOfMonth } from "./statusMonth";
import { fmt, toKey } from "./stepsUtil";
import { formatMinutes } from "./todos";
import { planOf, weekStreak } from "./training";
import type { Signals } from "./briefing";

/** Everything the chat can read — the same signals the briefing reads. */
export type ChatContext = Signals;

/** A write the chat understood but has not performed — it asks first. */
export interface PendingAction {
  kind: "steps" | "status";
  /** A count for the first, the label itself for the second. */
  value: number | string;
  /** What the confirmation prompt says out loud. */
  label: string;
}

export type Reply =
  | { kind: "answer"; text: string; source: string }
  | { kind: "confirm"; text: string; action: PendingAction }
  | { kind: "unknown"; text: string };

// --- reading the question ----------------------------------------------------

/**
 * Both languages, matched on stems rather than whole words: Ukrainian inflects
 * heavily, and "кроки / кроків / кроках" are the same question. A stem list is
 * cruder than a morphology library and needs no dependency — which is the right
 * trade for a field where the vocabulary is a dozen words.
 */
const has = (text: string, stems: string[]): boolean =>
  stems.some((stem) => text.includes(stem));

const QUESTION_WORDS = [
  "скільки",
  "коли",
  "де ",
  "яка",
  "який",
  "яке",
  "що ",
  "чому",
  "how",
  "when",
  "where",
  "what",
  "why",
  "?",
];

// Ukrainian alternates the vowel in some stems as it declines — слово → слів,
// ціль → цілі — so the stem that covers the nominative misses the very form a
// question is asked in. Where that happens both stems are listed; where the stem
// is stable it is cut short enough to cover every ending (ваг- takes вага, ваги,
// вагу, вазі, вагою).
const STEPS = ["крок", "step", "шаг", "пройш", "нахо"];
// ваг- covers вага, ваги, вагу, вагою; вазі alternates the consonant and needs
// its own entry.
const WEIGHT = ["ваг", "вазі", "важ", "weight", " кг", "kg"];
const WORDS = ["слов", "слів", "англій", "word", "english", "vocab"];
const NOTES = ["нотат", "note", "запис"];
const ROADMAP = ["roadmap", "роадмап", "етап", "milestone"];
const TRAINING = ["трену", "качал", "workout", "training", "підход", "спорт"];
const MARATHON = ["марафон", "marathon", "забіг"];
// "чим займався" is the same question as "які статуси" — the log is the only
// thing that can answer either.
const STATUS = ["статус", "status", "займ", "куди пішов день", "день пройш"];
const SUMMARY = ["як справи", "підсум", "загал", "коротк", "summary", "how am"];

/** How long ago something was, in the words a person would use for it. */
function ago(at: number, now: Date): string {
  const days = daysSince(at, now);
  if (days === 0) return "сьогодні";
  if (days === 1) return "вчора";
  return `${days} ${dayWord(days)} тому`;
}

/** A run of days, and what to call it in the answer. */
interface Period {
  days: Date[];
  label: string;
}

const rangeTo = (from: Date, to: Date): Date[] => {
  const out: Date[] = [];
  for (
    let d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.getTime() <= to.getTime();
    d = addDays(d, 1)
  ) {
    out.push(d);
  }
  return out;
};

/**
 * The stretch of time a question is about. Calendar weeks and calendar months,
 * because that is what the words mean — "this week" is the week you are in, not
 * the last seven days.
 */
function readPeriod(text: string, now: Date): Period | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (has(text, ["сьогодні", "today"])) {
    return { days: [today], label: "сьогодні" };
  }
  if (has(text, ["вчора", "учора", "yesterday"])) {
    return { days: [addDays(today, -1)], label: "вчора" };
  }
  if (has(text, ["тижд", "тижн", "week"])) {
    return { days: rangeTo(startOfWeek(now), today), label: "цього тижня" };
  }
  if (has(text, ["місяц", "month"])) {
    return { days: rangeTo(startOfMonth(now), today), label: "цього місяця" };
  }

  // "за 10 днів" / "last 10 days"
  const span = /(\d{1,3})\s*(дн|day)/.exec(text);
  if (span) {
    const count = Math.min(Number(span[1]), 366);
    return {
      days: lastNDays(count, now),
      label: `за ${count} ${dayWord(count)}`,
    };
  }

  return null;
}

/**
 * The first number in the text, tolerating "9 200" and "95,5".
 *
 * The separators are built from escapes rather than typed literally: a pasted
 * number can carry a non-breaking or narrow space, and those are invisible in
 * source — a reader sees an ordinary space and cannot tell the difference.
 */
const GROUPING = "\\s\\u00A0\\u202F";
const NUMBER = new RegExp(`(\\d[\\d${GROUPING}]*(?:[.,]\\d+)?)`);
const SEPARATORS = new RegExp(`[${GROUPING}]`, "g");

function readNumber(text: string): number | null {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(SEPARATORS, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

// --- answering ---------------------------------------------------------------

const sumSteps = (ctx: ChatContext, period: Period): number =>
  period.days.reduce((sum, day) => sum + (ctx.steps[toKey(day)] ?? 0), 0);

const loggedSteps = (ctx: ChatContext, period: Period): number =>
  period.days.filter((day) => (ctx.steps[toKey(day)] ?? 0) > 0).length;

function answerSteps(ctx: ChatContext, text: string, period: Period): Reply {
  const total = sumSteps(ctx, period);
  const logged = loggedSteps(ctx, period);

  if (total === 0) {
    return {
      kind: "answer",
      text: `Кроків ${period.label} не записано.`,
      source: "кроки",
    };
  }

  if (period.days.length === 1) {
    const goal = ctx.stepGoal;
    const tail =
      goal > 0
        ? total >= goal
          ? ` Ціль ${fmt(goal)} взято.`
          : ` До цілі ${fmt(goal - total)}.`
        : "";
    return {
      kind: "answer",
      text: `${fmt(total)} ${period.label}.${tail}`,
      source: "кроки",
    };
  }

  const average = Math.round(total / logged);
  const hit =
    ctx.stepGoal > 0
      ? period.days.filter(
          (day) => (ctx.steps[toKey(day)] ?? 0) >= ctx.stepGoal
        ).length
      : 0;
  const goalLine =
    ctx.stepGoal > 0
      ? ` Ціль узято ${hit} ${plural(hit, "день", "дні", "днів")} з ${logged}.`
      : "";

  // "яка середня" asks for one number, not the whole breakdown.
  if (has(text, ["середн", "average", "avg"])) {
    return {
      kind: "answer",
      text: `Середнє ${period.label} — ${fmt(average)} за ${logged} ${plural(logged, "день", "дні", "днів")}.`,
      source: "кроки",
    };
  }

  return {
    kind: "answer",
    text: `${fmt(total)} ${period.label} за ${logged} ${plural(logged, "день", "дні", "днів")}, середнє ${fmt(average)}.${goalLine}`,
    source: "кроки",
  };
}

/** The most recent logged weight at or before today, with its date. */
function latestWeight(ctx: ChatContext): { kilos: number; key: string } | null {
  const key = Object.keys(ctx.weights)
    .filter((date) => ctx.weights[date] > 0 && date <= toKey(ctx.now))
    .sort()
    .pop();
  return key ? { kilos: ctx.weights[key], key } : null;
}

function answerWeight(ctx: ChatContext, text: string): Reply {
  const latest = latestWeight(ctx);
  if (!latest) {
    return {
      kind: "answer",
      text: "На вагу ще нічого не записано.",
      source: "вага",
    };
  }

  const [y, m, d] = latest.key.split("-").map(Number);
  const lastSeen = ago(new Date(y, m - 1, d).getTime(), ctx.now);

  if (has(text, ["коли", "остан", "when", "last"])) {
    return {
      kind: "answer",
      text: `Востаннє ${lastSeen} — ${kg(latest.kilos)} кг.`,
      source: "вага",
    };
  }

  const gap = ctx.weightGoal > 0 ? latest.kilos - ctx.weightGoal : 0;
  const tail =
    ctx.weightGoal <= 0
      ? " Цільової ваги не задано."
      : Math.abs(gap) < 0.05
        ? " Це рівно ціль."
        : gap > 0
          ? ` Це на ${kg(gap)} кг вище цілі ${kg(ctx.weightGoal)}.`
          : ` Це на ${kg(-gap)} кг нижче цілі ${kg(ctx.weightGoal)}.`;

  return {
    kind: "answer",
    text: `${kg(latest.kilos)} кг.${tail}`,
    source: "вага",
  };
}

function answerWords(ctx: ChatContext, period: Period): Reply {
  const from = period.days[0].getTime();
  const added = ctx.vocabulary.filter(
    (word) => word.added > 0 && word.added >= from
  );
  const recent = ctx.vocabulary
    .slice(0, 3)
    .map((word) => word.term)
    .join(", ");
  return {
    kind: "answer",
    text: `${added.length} ${plural(added.length, "слово", "слова", "слів")} ${period.label}. Разом у словнику ${ctx.vocabulary.length}${recent ? ` — останні: ${recent}` : ""}.`,
    source: "англійська",
  };
}

function answerNotes(ctx: ChatContext, period: Period | null): Reply {
  if (ctx.devNotes.length === 0) {
    return { kind: "answer", text: "Нотаток ще немає.", source: "нотатки" };
  }

  const stamped = ctx.devNotes.map((note) => ({
    note,
    at: parseSqlDate(note.updated_at).getTime(),
  }));
  const newest = Math.max(...stamped.map(({ at }) => at));
  const total = ctx.devNotes.length;

  // "скільки нотаток цього тижня" is a different question from "скільки
  // нотаток", and the period is the only thing that says which was asked.
  if (period) {
    const from = period.days[0].getTime();
    const within = stamped.filter(({ at }) => at >= from).length;
    return {
      kind: "answer",
      text: `${within} ${plural(within, "нотатка", "нотатки", "нотаток")} ${period.label}. Разом ${total}, остання ${ago(newest, ctx.now)}.`,
      source: "нотатки",
    };
  }

  // Which subjects they sit under, biggest first — the breakdown the notes page
  // shows by folder and no single number can carry. Unfiled notes are counted
  // apart rather than listed as a subject of their own: "без теми — 10" as the
  // only entry of a breakdown is the total said twice.
  const bySubject = new Map<string, number>();
  for (const { note } of stamped) {
    if (!note.topic) continue;
    bySubject.set(note.topic, (bySubject.get(note.topic) ?? 0) + 1);
  }
  const filed = [...bySubject.values()].reduce((sum, n) => sum + n, 0);
  const spread = [...bySubject]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic, count]) => `${topicBySlug(topic)?.label ?? topic} — ${count}`)
    .join(", ");

  const tail = spread
    ? ` По темах: ${spread}${total > filed ? `, без теми — ${total - filed}` : ""}.`
    : " Жодна не розкладена по темах.";

  return {
    kind: "answer",
    text: `${total} ${plural(total, "нотатка", "нотатки", "нотаток")}, остання ${ago(newest, ctx.now)}.${tail}`,
    source: "нотатки",
  };
}

function answerRoadmap(ctx: ChatContext): Reply {
  if (ctx.milestones.length === 0) {
    return { kind: "answer", text: "Roadmap порожній.", source: "roadmap" };
  }
  const done = ctx.milestones.filter((m) => m.status === "done").length;
  const current = ctx.milestones.find((m) => m.status === "in_progress");
  const tail = current
    ? ` В роботі — «${current.title}» вже ${daysSince(parseSqlDate(current.updated_at).getTime(), ctx.now)} ${dayWord(daysSince(parseSqlDate(current.updated_at).getTime(), ctx.now))}.`
    : " Нічого не в роботі.";
  return {
    kind: "answer",
    text: `${done} з ${ctx.milestones.length} етапів пройдено.${tail}`,
    source: "roadmap",
  };
}

/** Sessions with sets in them — see `trained` in briefing.ts for the why. */
const sessions = (ctx: ChatContext) =>
  ctx.workouts.filter((session) => session.sets.length > 0);

function answerTraining(ctx: ChatContext, period: Period): Reply {
  const done = sessions(ctx);
  if (done.length === 0) {
    return {
      kind: "answer",
      text: "Тренувань ще не записано.",
      source: "тренування",
    };
  }

  const within = new Set(period.days.map(toKey));
  const inPeriod = done.filter((session) => within.has(session.date));
  const last = done
    .map((session) => session.date)
    .sort()
    .pop() as string;
  const [y, m, d] = last.split("-").map(Number);
  const lastSession = done.find((session) => session.date === last);
  const streak = weekStreak(
    new Set(done.map((session) => session.date)),
    ctx.now
  );

  const sets = inPeriod.reduce(
    (count, session) => count + session.sets.length,
    0
  );
  const streakLine =
    streak >= 2
      ? ` Тренування ${streak} ${plural(streak, "тиждень", "тижні", "тижнів")} поспіль.`
      : "";

  return {
    kind: "answer",
    text: `${inPeriod.length} ${plural(inPeriod.length, "тренування", "тренування", "тренувань")} ${period.label}${
      sets > 0
        ? `, ${sets} ${plural(sets, "підхід", "підходи", "підходів")}`
        : ""
    }. Останнє — «${planOf((lastSession ?? done[0]).kind).label}» ${ago(new Date(y, m - 1, d).getTime(), ctx.now)}.${streakLine}`,
    source: "тренування",
  };
}

function answerMarathon(ctx: ChatContext): Reply {
  const { marathon } = ctx;
  if (!marathon) {
    return {
      kind: "answer",
      text: "Марафону зараз немає. Почати можна на сторінці Marathon.",
      source: "марафон",
    };
  }

  const ticks = tickSet(marathon);
  const day = dayNow(marathon, ctx.now);
  const { clean, elapsed, streak, total } = progressOf(
    marathon,
    ticks,
    ctx.now
  );

  if (day < 1) {
    const away = 1 - day;
    return {
      kind: "answer",
      text: `«${marathon.title}» ще не почався — старт через ${away} ${dayWord(away)}.`,
      source: "марафон",
    };
  }
  if (day > total) {
    return {
      kind: "answer",
      text: `«${marathon.title}» закінчено: ${clean} з ${total} ${dayWord(total)} чисто.`,
      source: "марафон",
    };
  }

  const load = loadOfDay(marathon, day, ticks);
  const today =
    load.total === 0
      ? "На сьогодні в ньому нічого не записано."
      : load.done === load.total
        ? "Сьогодні закрито повністю."
        : `Сьогодні зроблено ${load.done} з ${load.total}.`;
  const streakLine =
    streak >= 2 ? ` Серія — ${streak} ${dayWord(streak)}.` : "";

  return {
    kind: "answer",
    text: `«${marathon.title}» — день ${day} з ${total}. ${today} Чистих днів ${clean} з ${elapsed}.${streakLine}`,
    source: "марафон",
  };
}

/**
 * Where today actually went, off the status log — the same spans the timeline
 * across the top of the dashboard is drawn from.
 */
function answerStatus(ctx: ChatContext): Reply {
  const totals = statusTotals(todaySpans(ctx.statusLog, ctx.now));
  if (totals.length === 0) {
    return {
      kind: "answer",
      text: "Сьогодні статусів не було.",
      source: "статуси",
    };
  }

  const logged = totals.reduce((sum, total) => sum + total.minutes, 0);
  const breakdown = totals
    .slice(0, 4)
    .map((total) => `${total.status} — ${formatMinutes(total.minutes)}`)
    .join(", ");
  const rest = totals.length > 4 ? `, та ще ${totals.length - 4}` : "";

  return {
    kind: "answer",
    text: `Записано ${formatMinutes(logged)} за сьогодні: ${breakdown}${rest}.`,
    source: "статуси",
  };
}

function answerSummary(ctx: ChatContext): Reply {
  const todayKey = toKey(ctx.now);
  const steps = ctx.steps[todayKey] ?? 0;
  const streak = currentStreak(ctx.steps, ctx.stepGoal, ctx.now);
  const weight = latestWeight(ctx);
  const closed = ctx.completions[todayKey] ?? 0;

  // The two newest areas belong in the summary or the summary is out of date
  // the moment either of them is the thing you did today.
  const workout = sessions(ctx).find((session) => session.date === todayKey);
  const marathonToday = ctx.marathon
    ? (() => {
        const day = dayNow(ctx.marathon, ctx.now);
        if (day < 1 || day > ctx.marathon.days) return null;
        const load = loadOfDay(ctx.marathon, day, tickSet(ctx.marathon));
        return load.total > 0 ? `марафон ${load.done}/${load.total}` : null;
      })()
    : null;

  const parts = [
    `Кроків сьогодні ${fmt(steps)}${ctx.stepGoal > 0 ? ` з ${fmt(ctx.stepGoal)}` : ""}`,
    weight ? `вага ${kg(weight.kilos)} кг` : null,
    `закрито ${closed} ${plural(closed, "задачу", "задачі", "задач")}`,
    workout ? `тренування «${planOf(workout.kind).label}»` : null,
    marathonToday,
    streak >= 2 ? `ціль по кроках ${streak} ${dayWord(streak)} поспіль` : null,
  ].filter(Boolean);

  return {
    kind: "answer",
    text: `${parts.join(", ")}. Режим — ${ctx.mode}.`,
    source: "сьогодні",
  };
}

// --- entries -----------------------------------------------------------------

/**
 * A write, if the text is one. Recognised only when a number or a known name is
 * present *and* the text is not a question — "9200 кроків" is an entry, and
 * "скільки кроків" is not, even though both name the same topic.
 */
function readEntry(text: string, original: string): PendingAction | null {
  const number = readNumber(text);

  if (number !== null && has(text, STEPS)) {
    const value = Math.round(number);
    if (value < 0 || value > 200000) return null;
    return {
      kind: "steps",
      value,
      label: `Записати ${fmt(value)} кроків за сьогодні?`,
    };
  }

  // Taking the status off, which is a status entry with nothing in it — the
  // same row the panel's Stop writes.
  if (/^(стоп|стій|нічого|нічим|stop|nothing|idle)$/.test(text)) {
    return {
      kind: "status",
      value: "",
      label: "Зупинити відлік статусу?",
    };
  }

  // A bare status: "статус Learning". Matched on the lowercased text but read
  // out of the original, so the status keeps the capitals you typed — it is a
  // label that gets displayed, not a keyword.
  const statusMatch = /(?:статус|status)\s+(.+)/.exec(text);
  if (statusMatch) {
    const value = original
      .slice(original.length - statusMatch[1].length)
      .trim()
      .slice(0, 60);
    if (value) {
      return { kind: "status", value, label: `Поставити статус «${value}»?` };
    }
  }

  return null;
}

// --- the front door ----------------------------------------------------------

const HELP = [
  "Я рахую по твоїх записах, тому вмію рівно те, що можна порахувати:",
  "• кроки — «скільки кроків сьогодні», «середнє за 30 днів»",
  "• вага — «яка вага», «коли я важився»",
  "• слова — «скільки слів цього тижня»",
  "• нотатки, roadmap — «скільки нотаток», «що по roadmap»",
  "• тренування — «скільки тренувань цього тижня»",
  "• марафон — «що по марафону»",
  "• статуси — «чим я займався сьогодні»",
  "• підсумок — «як справи»",
  "",
  "Записати: «9200 кроків», «статус Working», «стоп» — зняти статус.",
].join("\n");

export function ask(input: string, ctx: ChatContext): Reply {
  const text = input.toLowerCase().trim();
  if (!text) return { kind: "unknown", text: HELP };

  const asking = has(text, QUESTION_WORDS);

  // Entries are checked first, but only when the text is not a question — that
  // ordering is what keeps "скільки кроків" from being read as an entry of the
  // number it happens to contain.
  if (!asking) {
    const entry = readEntry(text, input.trim());
    if (entry) return { kind: "confirm", text: entry.label, action: entry };
  }

  // A weight or a mode dictated as an entry. Neither is written from here any
  // more, and without this "вага 95.5" would fall through to the weight answer
  // and report today's reading — a reply to a question that was not asked.
  if (
    !asking &&
    ((readNumber(text) !== null && has(text, WEIGHT)) ||
      has(text, ["режим", "mode"]))
  ) {
    return {
      kind: "unknown",
      text: "Звідси я записую тільки кроки і статус. Вагу, ціль і режим — у самій панелі.",
    };
  }

  // A week or a month that has already been and gone is not read any more.
  // Saying so has to be explicit: without it "скільки кроків минулого тижня"
  // falls through to the plain week branch and answers about *this* week under
  // this week's label — a true sentence, to a question nobody asked.
  if (has(text, ["минул", "попередн", "last "])) {
    return {
      kind: "unknown",
      text: "Минулі тижні й місяці я не рахую — тільки сьогодні, вчора, цей тиждень, цей місяць і «за N днів».",
    };
  }

  const period = readPeriod(text, ctx.now);
  const today: Period = {
    days: [
      new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate()),
    ],
    label: "сьогодні",
  };
  const thisWeek: Period = {
    days: rangeTo(startOfWeek(ctx.now), today.days[0]),
    label: "цього тижня",
  };

  if (has(text, SUMMARY)) return answerSummary(ctx);
  if (has(text, STEPS)) return answerSteps(ctx, text, period ?? today);
  if (has(text, WEIGHT)) return answerWeight(ctx, text);
  if (has(text, WORDS)) return answerWords(ctx, period ?? thisWeek);
  if (has(text, NOTES)) return answerNotes(ctx, period);
  if (has(text, ROADMAP)) return answerRoadmap(ctx);
  // Before the status branch: a marathon is asked about by name, and "статус"
  // would otherwise catch a question that happens to mention one.
  if (has(text, MARATHON)) return answerMarathon(ctx);
  if (has(text, TRAINING)) return answerTraining(ctx, period ?? thisWeek);
  if (has(text, STATUS)) return answerStatus(ctx);

  // A period and an aggregate, but no subject — "середнє за 30 днів". Steps are
  // the only daily number anyone asks that about, and answering the likely
  // question beats a help screen when the guess is this safe.
  if (
    period &&
    has(text, ["середн", "average", "avg", "всього", "разом", "total"])
  ) {
    return answerSteps(ctx, text, period);
  }

  return {
    kind: "unknown",
    text: `Цього я не зрозумів.\n\n${HELP}`,
  };
}
