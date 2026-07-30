import { useSyncExternalStore } from "react";
import type { Theme, ThemeName } from "./types";

const THEME_STORAGE_KEY = "dashboard-theme";

// Every colour the app uses lives here, so a new theme is one more entry rather
// than a sweep through the markup. Class strings style elements; plain hex/rgba
// values feed SVG attributes and inline styles.
export const THEMES: Record<ThemeName, Theme> = {
  light: {
    page: "bg-white bg-[radial-gradient(120%_90%_at_50%_0%,#f5f5fa_0%,#ffffff_58%)] text-[#16171a]",
    card: "border-[#eceef1] bg-white/80",
    cardHover: "hover:border-[#d7dae0]",
    rule: "border-[#eceef1]",
    label: "text-[#a6abb2]",
    muted: "text-[#a6abb2]",
    body: "text-[#6b7076]",
    faint: "text-[#c3c7cd]",
    rowHover: "hover:bg-[#f4f5fa]",
    outlineBtn:
      "border-[#4338ca] text-[#4338ca] hover:border-[#312e81] hover:text-[#312e81]",
    toggleOn: "bg-[#4338ca] text-white",
    toggleOff: "bg-transparent text-[#a6abb2] hover:text-[#16171a]",
    input:
      "border-[#e4e7ec] bg-[#fafbfc] text-[#16171a] placeholder:text-[#c3c7cd] focus:border-[#c9cdd4] focus:bg-white focus:ring-4 focus:ring-[#4338ca]/[0.08]",
    iconBtn: "text-[#c3c7cd] hover:bg-[#f1f3f7] hover:text-[#4b5057]",
    popover:
      "border-[#e4e7ec] bg-white shadow-[0_18px_44px_-16px_rgba(16,24,40,0.30)]",
    accent: "#4338ca",
    accentSoft: "rgba(67,56,202,0.28)",
    track: "#eceef1",
    goalLine: "rgba(67,56,202,0.25)",
    progressDot: "#2563eb",
    sidebar: "border-[#eceef1] bg-white",
    sidebarItem: "text-[#6b7076] hover:bg-[#f4f5fa] hover:text-[#16171a]",
    sidebarItemActive: "bg-[#e8e8f5] text-[#16171a]",
    sidebarBadge: "bg-[#f1f3f5] text-[#8b9097] hover:bg-[#e6e9ec]",
    sidebarCard: "bg-[#f4f5fa]",
  },
  dark: {
    page: "bg-navy bg-[radial-gradient(120%_90%_at_50%_0%,#13203a_0%,#0a0f1e_58%)] text-white",
    card: "border-white/[0.08] bg-white/[0.03]",
    cardHover: "hover:border-white/25",
    rule: "border-white/10",
    label: "text-white/35",
    muted: "text-white/40",
    body: "text-white/60",
    faint: "text-white/25",
    rowHover: "hover:bg-white/[0.05]",
    outlineBtn:
      "border-[#818cf8] text-[#818cf8] hover:border-white hover:text-white",
    toggleOn: "bg-[#818cf8] text-[#0a0f1e]",
    toggleOff: "bg-transparent text-white/40 hover:text-white",
    input:
      "border-white/[0.10] bg-white/[0.04] text-white placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.07] focus:ring-4 focus:ring-[#818cf8]/[0.14]",
    iconBtn: "text-white/30 hover:bg-white/[0.08] hover:text-white/80",
    popover:
      "border-white/[0.12] bg-[#1a2131] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.72)]",
    accent: "#818cf8",
    accentSoft: "rgba(129,140,248,0.3)",
    track: "rgba(255,255,255,0.09)",
    goalLine: "rgba(129,140,248,0.3)",
    progressDot: "#60a5fa",
    sidebar: "border-white/[0.06] bg-[#070b16]",
    sidebarItem: "text-white/45 hover:bg-white/[0.06] hover:text-white",
    sidebarItemActive: "bg-white/[0.09] text-white",
    sidebarBadge: "bg-white/[0.06] text-white/45 hover:bg-white/[0.12]",
    sidebarCard: "bg-white/[0.05]",
  },
};

// Shared type scale, so a card on the vocabulary page reads as the same
// component as a card on the dashboard.
export const numeralClass = "font-extralight tracking-[-0.02em] tabular-nums";
export const labelClass = (t: Theme) =>
  `m-0 text-[0.6rem] uppercase tracking-[0.2em] ${t.label}`;
export const cardClass = (t: Theme) => `rounded-3xl border p-4 ${t.card}`;

const readTheme = (): ThemeName => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be blocked; fall through to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

// The theme is one value for the whole app rather than per-component state, so
// it lives in a module-level store: every screen reads the same choice and every
// screen re-renders when it changes.
let current: ThemeName = readTheme();
const listeners = new Set<() => void>();

// Elements painted outside the themed pages — the carousel dots, the body
// background, native scrollbars — read the theme off the root element.
const applyToDocument = (theme: ThemeName) => {
  document.documentElement.dataset.theme = theme;
};

// Runs at import time so the first paint already matches the stored choice.
applyToDocument(current);

const emit = () => listeners.forEach((listener) => listener());

export function setTheme(next: ThemeName) {
  if (next === current) return;
  current = next;
  applyToDocument(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Persisting is best-effort; the choice still applies for this session.
  }
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Another tab switching the theme should switch this one too.
window.addEventListener("storage", (e) => {
  if (e.key !== THEME_STORAGE_KEY) return;
  if (e.newValue !== "light" && e.newValue !== "dark") return;
  if (e.newValue === current) return;
  current = e.newValue;
  applyToDocument(current);
  emit();
});

const getSnapshot = () => current;

export function useThemeName(): ThemeName {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The active palette, its name, and the app-wide setter. */
export function useTheme() {
  const theme = useThemeName();
  return { t: THEMES[theme], theme, setTheme };
}
