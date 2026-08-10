import { useSyncExternalStore } from "react";
import type { Scheme, Theme, Treatment } from "./types";

const THEME_STORAGE_KEY = "dashboard-theme";

// Text, dividers and hover states are the same whatever is painted behind them,
// because every one of them is white or ink at some opacity. Only the ground —
// background, cards, sidebar, accent — belongs to a treatment. Kept as literal
// class strings rather than composed, so Tailwind still sees each one.
const darkBase = {
  scheme: "dark",
  appFg: "#e8eaee",
  page: "text-[#e8eaee]",
  cardHover: "hover:border-white/25",
  rule: "border-white/[0.10]",
  label: "text-white/35",
  muted: "text-white/40",
  body: "text-white/60",
  faint: "text-white/25",
  rowHover: "hover:bg-white/[0.05]",
  toggleOff: "bg-transparent text-white/40 hover:text-white",
  iconBtn: "text-white/30 hover:bg-white/[0.08] hover:text-white/80",
  track: "rgba(255,255,255,0.10)",
  // Blue means "in progress" across the app, so it is fixed rather than tied to
  // the accent — see the status colours in RoadmapTimeline.
  progressDot: "#60a5fa",
  sidebarItem: "text-white/45 hover:bg-white/[0.07] hover:text-white",
  sidebarItemActive: "bg-white/[0.10] text-white",
  sidebarBadge: "bg-white/[0.07] text-white/45 hover:bg-white/[0.14]",
  sidebarCard: "bg-white/[0.06]",
} as const;

// The light neutrals are all ink-at-an-opacity for the same reason, which also
// lets them sit on any of the four grounds — white, off-white or tinted.
const lightBase = {
  scheme: "light",
  appFg: "#1b1d21",
  page: "text-[#1b1d21]",
  rule: "border-[#1b1d21]/[0.09]",
  label: "text-[#1b1d21]/45",
  muted: "text-[#1b1d21]/45",
  body: "text-[#1b1d21]/65",
  faint: "text-[#1b1d21]/30",
  rowHover: "hover:bg-[#1b1d21]/[0.04]",
  toggleOff: "bg-transparent text-[#1b1d21]/45 hover:text-[#1b1d21]",
  iconBtn:
    "text-[#1b1d21]/30 hover:bg-[#1b1d21]/[0.06] hover:text-[#1b1d21]/75",
  track: "rgba(27,29,33,0.10)",
  progressDot: "#2563eb",
  sidebarItem:
    "text-[#1b1d21]/65 hover:bg-[#1b1d21]/[0.05] hover:text-[#1b1d21]",
  sidebarItemActive: "bg-[#1b1d21]/[0.07] text-[#1b1d21]",
  sidebarBadge:
    "bg-[#1b1d21]/[0.05] text-[#1b1d21]/50 hover:bg-[#1b1d21]/[0.09]",
  sidebarCard: "bg-[#1b1d21]/[0.045]",
} as const;

/**
 * Every colour the app uses, indexed by treatment and then by scheme.
 *
 * `backdrop` is painted on one fixed layer behind everything (see index.css),
 * so it stays put while pages swap and the carousel slides across it. Flat is
 * the exception that proves the rule: it paints nothing, and the cards are
 * opaque rather than frosted, because there is nothing behind them to frost.
 */
export const THEMES: Record<Treatment, Record<Scheme, Theme>> = {
  flat: {
    dark: {
      ...darkBase,
      title: "Flat",
      appBg: "#0c0d10",
      carouselDot: "#7d8796",
      backdrop: "none",
      card: "border-[#212228] bg-[#141519]",
      outlineBtn:
        "border-[#98a2b3] text-[#98a2b3] hover:border-white hover:text-white",
      toggleOn: "bg-[#98a2b3] text-[#0c0d10]",
      input:
        "border-[#25262c] bg-[#141519] text-[#e8eaee] placeholder:text-white/25 focus:border-white/28 focus:bg-[#191a1f] focus:ring-4 focus:ring-[#98a2b3]/[0.14]",
      popover:
        "border-[#242530] bg-[#16181d] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.72)]",
      surface: "bg-[#16181d]",
      accent: "#98a2b3",
      accentSoft: "rgba(152,162,179,0.30)",
      goalLine: "rgba(152,162,179,0.30)",
      sidebar: "border-[#212228] bg-[#0a0b0d]",
    },
    light: {
      ...lightBase,
      title: "Flat",
      appBg: "#f7f8f9",
      carouselDot: "#7d8796",
      backdrop: "none",
      card: "border-[#e7e9ee] bg-white",
      cardHover: "hover:border-[#cfd3db]",
      outlineBtn:
        "border-[#55606f] text-[#55606f] hover:border-[#3f4854] hover:text-[#3f4854]",
      toggleOn: "bg-[#55606f] text-white",
      input:
        "border-[#e0e3e9] bg-[#fbfbfc] text-[#1b1d21] placeholder:text-[#1b1d21]/30 focus:border-[#c8cdd6] focus:bg-white focus:ring-4 focus:ring-[#55606f]/[0.12]",
      popover:
        "border-[#e0e3e9] bg-white shadow-[0_18px_44px_-16px_rgba(20,24,33,0.24)]",
      surface: "bg-white",
      accent: "#55606f",
      accentSoft: "rgba(85,96,111,0.26)",
      goalLine: "rgba(85,96,111,0.24)",
      sidebar: "border-[#e7e9ee] bg-white",
    },
  },

  canvas: {
    dark: {
      ...darkBase,
      title: "Canvas",
      appBg: "#0b0c10",
      carouselDot: "#7e8fa4",
      backdrop:
        "linear-gradient(157deg, #191d28 0%, #0d0f14 52%, #14181f 100%)",
      card: "border-white/[0.09] bg-white/[0.045] backdrop-blur-lg",
      outlineBtn:
        "border-[#9fb0c4] text-[#9fb0c4] hover:border-white hover:text-white",
      toggleOn: "bg-[#9fb0c4] text-[#0b0c10]",
      input:
        "border-white/[0.11] bg-white/[0.05] text-[#e8eaee] placeholder:text-white/25 focus:border-white/28 focus:bg-white/[0.09] focus:ring-4 focus:ring-[#9fb0c4]/[0.14]",
      popover:
        "border-white/[0.12] bg-[#14181f] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.72)]",
      surface: "bg-[#14181f]",
      accent: "#9fb0c4",
      accentSoft: "rgba(159,176,196,0.30)",
      goalLine: "rgba(159,176,196,0.30)",
      sidebar: "border-white/[0.07] bg-[#08090c]/55 backdrop-blur-xl",
    },
    light: {
      ...lightBase,
      title: "Canvas",
      appBg: "#ffffff",
      carouselDot: "#7e8fa4",
      backdrop:
        "linear-gradient(157deg, #eef1f6 0%, #ffffff 52%, #f0f3f8 100%)",
      card: "border-white/80 bg-white/70 backdrop-blur-lg",
      cardHover: "hover:border-white",
      outlineBtn:
        "border-[#566578] text-[#566578] hover:border-[#414d5d] hover:text-[#414d5d]",
      toggleOn: "bg-[#566578] text-white",
      input:
        "border-[#1b1d21]/[0.10] bg-white/70 text-[#1b1d21] placeholder:text-[#1b1d21]/30 focus:border-[#1b1d21]/20 focus:bg-white focus:ring-4 focus:ring-[#566578]/[0.12]",
      popover:
        "border-[#e2e6ed] bg-white shadow-[0_18px_44px_-16px_rgba(20,24,33,0.22)]",
      surface: "bg-white",
      accent: "#566578",
      accentSoft: "rgba(86,101,120,0.26)",
      goalLine: "rgba(86,101,120,0.24)",
      sidebar: "border-[#1b1d21]/[0.07] bg-white/60 backdrop-blur-xl",
    },
  },

  spotlight: {
    dark: {
      ...darkBase,
      title: "Spotlight",
      appBg: "#07080a",
      carouselDot: "#8a929e",
      backdrop:
        "radial-gradient(78% 62% at 50% -14%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 68%)",
      card: "border-white/[0.09] bg-white/[0.05] backdrop-blur-md",
      outlineBtn:
        "border-[#b9c0cb] text-[#b9c0cb] hover:border-white hover:text-white",
      toggleOn: "bg-[#b9c0cb] text-[#07080a]",
      input:
        "border-white/[0.11] bg-white/[0.05] text-[#e8eaee] placeholder:text-white/25 focus:border-white/28 focus:bg-white/[0.09] focus:ring-4 focus:ring-[#b9c0cb]/[0.14]",
      popover:
        "border-white/[0.12] bg-[#101216] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.78)]",
      surface: "bg-[#101216]",
      accent: "#b9c0cb",
      accentSoft: "rgba(185,192,203,0.28)",
      goalLine: "rgba(185,192,203,0.28)",
      sidebar: "border-white/[0.07] bg-[#060709]/50 backdrop-blur-xl",
    },
    light: {
      ...lightBase,
      title: "Spotlight",
      appBg: "#eceef2",
      carouselDot: "#8a929e",
      backdrop:
        "radial-gradient(82% 66% at 50% -12%, #ffffff 0%, rgba(255,255,255,0) 70%)",
      card: "border-white/90 bg-white/65 backdrop-blur-md",
      cardHover: "hover:border-white",
      outlineBtn:
        "border-[#4e5763] text-[#4e5763] hover:border-[#3a424c] hover:text-[#3a424c]",
      toggleOn: "bg-[#4e5763] text-white",
      input:
        "border-[#1b1d21]/[0.10] bg-white/70 text-[#1b1d21] placeholder:text-[#1b1d21]/30 focus:border-[#1b1d21]/20 focus:bg-white focus:ring-4 focus:ring-[#4e5763]/[0.12]",
      popover:
        "border-[#dfe2e8] bg-white shadow-[0_18px_44px_-16px_rgba(20,24,33,0.26)]",
      surface: "bg-white",
      accent: "#4e5763",
      accentSoft: "rgba(78,87,99,0.26)",
      goalLine: "rgba(78,87,99,0.24)",
      sidebar: "border-[#1b1d21]/[0.07] bg-white/55 backdrop-blur-xl",
    },
  },

  blueprint: {
    dark: {
      ...darkBase,
      title: "Blueprint",
      appBg: "#0a0f14",
      carouselDot: "#4a9cc4",
      backdrop:
        "linear-gradient(rgba(120,190,230,0.09) 1px, transparent 1px), " +
        "linear-gradient(90deg, rgba(120,190,230,0.09) 1px, transparent 1px), " +
        "linear-gradient(rgba(120,190,230,0.045) 1px, transparent 1px), " +
        "linear-gradient(90deg, rgba(120,190,230,0.045) 1px, transparent 1px)",
      backdropSize: "96px 96px, 96px 96px, 16px 16px, 16px 16px",
      card: "border-white/[0.09] bg-white/[0.045] backdrop-blur-md",
      outlineBtn:
        "border-[#7fc2e0] text-[#7fc2e0] hover:border-white hover:text-white",
      toggleOn: "bg-[#7fc2e0] text-[#0a0f14]",
      input:
        "border-white/[0.11] bg-white/[0.05] text-[#e8eaee] placeholder:text-white/25 focus:border-white/28 focus:bg-white/[0.09] focus:ring-4 focus:ring-[#7fc2e0]/[0.14]",
      popover:
        "border-white/[0.12] bg-[#0f1720] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.72)]",
      surface: "bg-[#0f1720]",
      accent: "#7fc2e0",
      accentSoft: "rgba(127,194,224,0.30)",
      goalLine: "rgba(127,194,224,0.30)",
      sidebar: "border-white/[0.07] bg-[#080c11]/70 backdrop-blur-xl",
    },
    light: {
      ...lightBase,
      title: "Blueprint",
      appBg: "#f8fafb",
      carouselDot: "#4a9cc4",
      backdrop:
        "linear-gradient(rgba(40,110,150,0.11) 1px, transparent 1px), " +
        "linear-gradient(90deg, rgba(40,110,150,0.11) 1px, transparent 1px), " +
        "linear-gradient(rgba(40,110,150,0.055) 1px, transparent 1px), " +
        "linear-gradient(90deg, rgba(40,110,150,0.055) 1px, transparent 1px)",
      backdropSize: "96px 96px, 96px 96px, 16px 16px, 16px 16px",
      card: "border-white/85 bg-white/85 backdrop-blur-md",
      cardHover: "hover:border-[#bcd4e0]",
      outlineBtn:
        "border-[#2b7ea3] text-[#2b7ea3] hover:border-[#1f6180] hover:text-[#1f6180]",
      toggleOn: "bg-[#2b7ea3] text-white",
      input:
        "border-[#1b1d21]/[0.10] bg-white/80 text-[#1b1d21] placeholder:text-[#1b1d21]/30 focus:border-[#1b1d21]/20 focus:bg-white focus:ring-4 focus:ring-[#2b7ea3]/[0.12]",
      popover:
        "border-[#dde8ee] bg-white shadow-[0_18px_44px_-16px_rgba(15,40,55,0.22)]",
      surface: "bg-white",
      accent: "#2b7ea3",
      accentSoft: "rgba(43,126,163,0.26)",
      goalLine: "rgba(43,126,163,0.24)",
      sidebar: "border-[#1b1d21]/[0.07] bg-white/80 backdrop-blur-xl",
    },
  },
};

/** The treatments in picker order, typed — `Object.entries` widens the key. */
export const treatmentOptions = Object.entries(THEMES) as [
  Treatment,
  Record<Scheme, Theme>,
][];

// Shared type scale, so a card on the vocabulary page reads as the same
// component as a card on the dashboard.
export const numeralClass = "font-extralight tracking-[-0.02em] tabular-nums";
export const labelClass = (t: Theme) =>
  `m-0 text-[0.6rem] uppercase tracking-[0.2em] ${t.label}`;
export const cardClass = (t: Theme) => `rounded-3xl border p-4 ${t.card}`;

interface Choice {
  treatment: Treatment;
  scheme: Scheme;
}

const isTreatment = (value: string): value is Treatment => value in THEMES;

// The key has held three generations of names — first "light"/"dark", then a
// set of palette names, now "<treatment>:<scheme>". Anything unrecognised falls
// through to the OS preference rather than throwing the app into a broken
// state, and every old name keeps at least the scheme its owner chose.
const LEGACY_SCHEMES: Record<string, Scheme> = {
  light: "light",
  white: "light",
  sand: "light",
  paper: "light",
  dawn: "light",
  dark: "dark",
  forest: "dark",
  midnight: "dark",
  graphite: "dark",
  plum: "dark",
  nord: "dark",
  dracula: "dark",
  solarized: "dark",
  smoke: "dark",
  ash: "dark",
  moss: "dark",
  nebula: "dark",
  lagoon: "dark",
  ember: "dark",
};

const parseChoice = (value: string | null): Choice | null => {
  if (!value) return null;

  const [treatment, scheme] = value.split(":");
  if (isTreatment(treatment) && (scheme === "light" || scheme === "dark")) {
    return { treatment, scheme };
  }

  const legacy = LEGACY_SCHEMES[value];
  return legacy ? { treatment: "canvas", scheme: legacy } : null;
};

const readChoice = (): Choice => {
  try {
    const saved = parseChoice(localStorage.getItem(THEME_STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // Storage can be blocked; fall through to the OS preference.
  }
  return {
    treatment: "canvas",
    scheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  };
};

const paletteFor = ({ treatment, scheme }: Choice): Theme =>
  THEMES[treatment][scheme];

// The choice is one value for the whole app rather than per-component state, so
// it lives in a module-level store: every screen reads the same choice and every
// screen re-renders when it changes.
let current: Choice = readChoice();
const listeners = new Set<() => void>();

// Elements painted outside the themed pages — the backdrop, the carousel dots,
// native scrollbars — read the theme off the root element. The palette is
// pushed onto it as custom properties rather than kept as a block of per-theme
// CSS, so adding a treatment stays a single entry in THEMES.
const applyToDocument = (choice: Choice) => {
  const { style, dataset } = document.documentElement;
  const palette = paletteFor(choice);
  dataset.treatment = choice.treatment;
  dataset.theme = choice.scheme;
  style.colorScheme = palette.scheme;
  style.setProperty("--app-bg", palette.appBg);
  style.setProperty("--app-fg", palette.appFg);
  style.setProperty("--carousel-dot", palette.carouselDot);
  style.setProperty("--backdrop", palette.backdrop);
  style.setProperty("--backdrop-size", palette.backdropSize ?? "auto");
};

// Runs at import time so the first paint already matches the stored choice.
applyToDocument(current);

const emit = () => listeners.forEach((listener) => listener());

const commit = (next: Choice) => {
  if (next.treatment === current.treatment && next.scheme === current.scheme) {
    return;
  }
  current = next;
  applyToDocument(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, `${next.treatment}:${next.scheme}`);
  } catch {
    // Persisting is best-effort; the choice still applies for this session.
  }
  emit();
};

export function setTreatment(treatment: Treatment) {
  commit({ ...current, treatment });
}

export function setScheme(scheme: Scheme) {
  commit({ ...current, scheme });
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
  const next = parseChoice(e.newValue);
  if (!next) return;
  current = next;
  applyToDocument(current);
  emit();
});

const getSnapshot = () => current;

function useChoice(): Choice {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The active palette, what was chosen to get it, and the app-wide setters. */
export function useTheme() {
  const choice = useChoice();
  return {
    t: paletteFor(choice),
    treatment: choice.treatment,
    scheme: choice.scheme,
    setTreatment,
    setScheme,
  };
}
