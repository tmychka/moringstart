// Agreement helpers for the two languages every generated line is written in.
// They live apart from the modules that generate those lines because there is
// now more than one of them, and a count reads the same wherever it is counted.

/**
 * Ukrainian picks a form by the last digit, except in the teens, which all take
 * the many-form regardless of what they end in: 1 задача, 2 задачі, 5 задач,
 * but 11 задач and 21 задача.
 */
export const plural = (
  n: number,
  one: string,
  few: string,
  many: string
): string => {
  const hundred = n % 100;
  const ten = n % 10;
  if (hundred >= 11 && hundred <= 14) return many;
  if (ten === 1) return one;
  if (ten >= 2 && ten <= 4) return few;
  return many;
};

export const days = (n: number) => plural(n, "день", "дні", "днів");
export const tasks = (n: number) => plural(n, "задачу", "задачі", "задач");
export const times = (n: number) => plural(n, "раз", "рази", "разів");
export const words = (n: number) => plural(n, "слово", "слова", "слів");

/** English is only ever regular here, so one rule covers it. */
export const s = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/**
 * Calendar days between an instant and now, counted by local midnights.
 *
 * Not elapsed 24-hour blocks: something written yesterday at 23:00 and read at
 * 00:30 is a day old, not zero days old. The day turns at midnight, so that is
 * what has to be counted — and rounding covers the two days a year that are 23
 * or 25 hours long.
 */
export const daysSince = (ms: number, now: Date): number => {
  const midnightOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnightOf(now) - midnightOf(new Date(ms))) / 86400000);
};
