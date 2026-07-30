export const fmt = (n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const toKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
