import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { treatmentOptions } from "../theme";
import type { Scheme, Theme, Treatment } from "../types";

const COLLAPSED_STORAGE_KEY = "dashboard-sidebar-collapsed";

const SCHEMES: { value: Scheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const RAIL_WIDTH = "w-[64px]";
const PANEL_WIDTH = "w-[236px]";

// 24×24 stroke icons drawn inline, so the sidebar needs no icon dependency.
const ICONS = {
  activity: <path d="M3.4 12h3.9l2.5-6.4 4.2 12.8 2.5-6.4h4.1" />,
  dumbbell: (
    <>
      <path d="M6.9 8.6v6.8M4.3 10.4v3.2M17.1 8.6v6.8M19.7 10.4v3.2" />
      <path d="M6.9 12h10.2" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.4" r="7.2" />
      <path d="M12 10v3.4l2.4 1.6M9.7 3.4h4.6" />
    </>
  ),
  // A rope swinging between two handles. The handles are angled away from the
  // arc rather than sitting on top of it — at this size a straight cap reads as
  // part of the curve, and the whole thing comes out as a plain letter U.
  rope: (
    <>
      <path d="M7 7.2v2.6a5 5 0 0 0 10 0V7.2" />
      <path d="M4.9 3.9 7 7.2M19.1 3.9 17 7.2" />
    </>
  ),
  checklist: (
    <>
      <path d="M3.8 7.4 5.7 9.3l3.2-3.4" />
      <path d="M3.8 16.4l1.9 1.9 3.2-3.4" />
      <path d="M12.4 7.2h7.8M12.4 16.2h7.8" />
    </>
  ),
  notes: (
    <>
      <rect x="4.6" y="3.5" width="14.8" height="17" rx="2.6" />
      <path d="M8.4 8.4h7.2M8.4 12h7.2M8.4 15.6h4.4" />
    </>
  ),
  book: (
    <>
      <path d="M4.6 5.2A1.7 1.7 0 0 1 6.3 3.5H19.4v13.4H6.3a1.7 1.7 0 0 0-1.7 1.7z" />
      <path d="M4.6 18.6a1.7 1.7 0 0 0 1.7 1.7h13.1v-3.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.9" />
      <path d="M12 2.9V5M12 19v2.1M4.5 4.5 6 6M18 18l1.5 1.5M2.9 12H5M19 12h2.1M4.5 19.5 6 18M18 6l1.5-1.5" />
    </>
  ),
  moon: <path d="M20.4 14.6A8.4 8.4 0 0 1 9.4 3.6a8.4 8.4 0 1 0 11 11Z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.3" />
      <path d="M9.9 9.6a2.2 2.2 0 1 1 2.9 2.1c-.6.2-.9.7-.9 1.3v.4" />
      <path d="M12 16.5h.01" />
    </>
  ),
  code: <path d="m9.2 8.4-3.8 3.6 3.8 3.6M14.8 8.4l3.8 3.6-3.8 3.6" />,
  panel: (
    <>
      <rect x="3.4" y="4.4" width="17.2" height="15.2" rx="3" />
      <path d="M9.6 4.4v15.2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

/** One entry in the sidebar's nav list. */
export interface SidebarLink {
  icon: IconName;
  label: string;
  to: string;
}

function Icon({
  name,
  className = "h-[18px] w-[18px]",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      if (!list) return () => {};
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => window.matchMedia?.(query).matches ?? false,
    [query]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

interface SidebarProps {
  t: Theme;
  treatment: Treatment;
  scheme: Scheme;
  onTreatment: (treatment: Treatment) => void;
  onScheme: (scheme: Scheme) => void;
  onNavigate: (to: string) => void;
  /** Route the sidebar is being rendered on, so it can mark its own entry. */
  activePath?: string;
  links?: SidebarLink[];
  /**
   * `minimal` keeps only the brand row, the links it was given and the theme
   * switch, for pages that want a way back and nothing competing with their
   * own content.
   */
  variant?: "full" | "minimal";
  /**
   * Optional block shown in the space under the nav. Passed in rather than
   * built here so the sidebar keeps taking everything it draws as props.
   */
  support?: ReactNode;
}

export default function Sidebar({
  t,
  treatment,
  scheme,
  onTreatment,
  onScheme,
  onNavigate,
  activePath = "/",
  links = [],
  variant = "full",
  support,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [helpOpen, setHelpOpen] = useState(false);
  const [backgroundsOpen, setBackgroundsOpen] = useState(false);

  const full = variant === "full";

  // Below md the panel would eat most of the viewport, so it floats over the
  // content instead of squeezing it and a backdrop closes it again.
  const narrow = useMediaQuery("(max-width: 767px)");
  const expanded = !collapsed;
  const floating = narrow && expanded;

  // The nav is what the sidebar is for. On a short window there is not room for
  // it and the support block both — `flex-1` would squeeze the nav into a
  // scrolling sliver — so the block is the one that gives way.
  const tallEnough = useMediaQuery("(min-height: 640px)");

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // Persisting is best-effort; the choice still applies for this session.
    }
  }, [collapsed]);

  // Both footer panels need the panel open to be readable, so a click on the
  // rail expands the sidebar and opens the panel in one go.
  const openHelp = () => {
    if (collapsed) setCollapsed(false);
    setHelpOpen((open) => (collapsed ? true : !open));
  };

  const openBackgrounds = () => {
    if (collapsed) setCollapsed(false);
    setBackgroundsOpen((open) => (collapsed ? true : !open));
  };

  return (
    <>
      {floating && (
        <>
          <div className={`${RAIL_WIDTH} shrink-0`} aria-hidden="true" />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setCollapsed(true)}
            className="absolute inset-0 z-30 cursor-pointer border-none bg-black/35 p-0"
          />
        </>
      )}

      <aside
        className={`flex h-full shrink-0 flex-col border-r transition-[width] duration-300 ease-out ${t.sidebar} ${
          expanded ? PANEL_WIDTH : RAIL_WIDTH
        } ${
          floating
            ? "absolute inset-y-0 left-0 z-40 shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
            : "relative"
        }`}
      >
        {/* The brand is also the way back: every page reaches the dashboard by
            clicking it, so no entry in the nav has to carry that job. Collapsed,
            it stacks above the toggle rather than leaving the rail without one. */}
        <div
          className={`flex py-5 ${expanded ? "items-center gap-2.5 px-4" : "flex-col items-center gap-1.5 px-0"}`}
        >
          <button
            type="button"
            onClick={() => onNavigate("/")}
            title="Dashboard"
            aria-label="Dashboard"
            aria-current={activePath === "/" ? "page" : undefined}
            className={`flex min-w-0 cursor-pointer items-center rounded-xl border-none bg-transparent transition-colors ${t.rowHover} ${
              expanded
                ? "flex-1 gap-2.5 px-2 py-1.5"
                : "h-9 w-9 justify-center p-0"
            }`}
          >
            <BrandMark t={t} />
            {expanded && (
              <span className="min-w-0 flex-1 truncate text-left text-[0.92rem] font-semibold tracking-[-0.01em]">
                Morning Start
              </span>
            )}
          </button>
          <IconButton
            t={t}
            icon="panel"
            label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-2">
          {/* One flat list either way: on a full sidebar these are the app's
              areas, on a minimal one the sections of the page showing it. */}
          {links.map((link) => (
            <NavItem
              key={link.label}
              t={t}
              icon={link.icon}
              label={link.label}
              collapsed={collapsed}
              active={activePath === link.to}
              onClick={() => onNavigate(link.to)}
            />
          ))}
        </nav>

        {/* Fills the gap between the nav and the footer. Only on an expanded
            full sidebar with room for it: the rail has no width for prose, and
            a minimal sidebar is minimal on purpose. */}
        {full && expanded && tallEnough && support}

        <div className={`border-t px-3 py-3 ${t.rule}`}>
          {full && expanded && helpOpen && (
            <ul
              className={`m-0 mb-2 list-none rounded-xl p-3 text-[0.72rem] leading-relaxed ${t.sidebarCard} ${t.body}`}
            >
              <li>← → or swipe switches dashboard and body map.</li>
              <li className="mt-1.5">Pick an area to open its own page.</li>
              <li className="mt-1.5">
                ← → or swipe again goes back from an area page.
              </li>
              <li className="mt-1.5">
                Clicking Morning Start returns to the dashboard.
              </li>
            </ul>
          )}
          {full && (
            <NavItem
              t={t}
              icon="help"
              label="Help & information"
              collapsed={collapsed}
              active={expanded && helpOpen}
              onClick={openHelp}
            />
          )}
          {expanded && backgroundsOpen && (
            // Capped against the viewport so the panel scrolls on a short
            // window instead of pushing the nav above it out of the sidebar.
            <div
              className={`mb-2 max-h-[42vh] overflow-y-auto rounded-xl p-1.5 ${t.sidebarCard}`}
            >
              <div
                role="group"
                aria-label="Colour scheme"
                className="mb-1 flex gap-1"
              >
                {SCHEMES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onScheme(value)}
                    aria-pressed={value === scheme}
                    className={`flex-1 cursor-pointer rounded-lg border-none px-2 py-1.5 text-[0.72rem] transition-colors ${
                      value === scheme
                        ? `font-medium ${t.sidebarItemActive}`
                        : `bg-transparent ${t.sidebarItem}`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="m-0 list-none p-0">
                {treatmentOptions.map(([name, schemes]) => {
                  // Preview the treatment in the scheme that is actually on, so
                  // the swatch shows what picking it would give you.
                  const palette = schemes[scheme];
                  const active = name === treatment;

                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => onTreatment(name)}
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-left text-[0.78rem] transition-colors ${
                          active ? t.sidebarItemActive : t.sidebarItem
                        }`}
                      >
                        {/* The swatch is the treatment in miniature — the same
                            backdrop it paints behind the app, over the same
                            base colour. Tiled patterns need their own scale
                            here, or a 96px grid would leave the circle blank. */}
                        <span
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{
                            backgroundColor: palette.appBg,
                            backgroundImage: palette.backdrop,
                            backgroundSize: palette.backdropSize
                              ? "10px 10px, 10px 10px, 4px 4px, 4px 4px"
                              : undefined,
                            boxShadow: `inset 0 0 0 1px ${palette.accent}66`,
                          }}
                        />
                        <span
                          className={`truncate ${active ? "font-medium" : ""}`}
                        >
                          {palette.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <NavItem
            t={t}
            icon={t.scheme === "dark" ? "moon" : "sun"}
            label="Background"
            collapsed={collapsed}
            active={expanded && backgroundsOpen}
            onClick={openBackgrounds}
          />
        </div>
      </aside>
    </>
  );
}

function BrandMark({ t }: { t: Theme }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px] shrink-0"
      fill="none"
      stroke={t.accent}
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7.4 16.6a4.6 4.6 0 0 1 9.2 0" fill={t.accentSoft} />
      <path d="M3.6 16.6h16.8M12 3.4v2.4M5.2 6.6l1.7 1.7M18.8 6.6l-1.7 1.7" />
    </svg>
  );
}

interface NavItemProps {
  t: Theme;
  icon: IconName;
  label: string;
  collapsed: boolean;
  active?: boolean;
  onClick: () => void;
}

function NavItem({ t, icon, label, collapsed, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      // min-w-0 so a long label ellipsises instead of pushing past the panel:
      // a flex item won't shrink below its content without it.
      className={`flex w-full min-w-0 cursor-pointer items-center rounded-xl border-none bg-transparent text-left transition-colors ${
        collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5"
      } ${active ? t.sidebarItemActive : t.sidebarItem}`}
    >
      <Icon name={icon} />
      {!collapsed && (
        <span
          title={label}
          className={`min-w-0 flex-1 truncate text-[0.83rem] ${active ? "font-medium" : ""}`}
        >
          {label}
        </span>
      )}
    </button>
  );
}

interface ButtonProps {
  t: Theme;
  icon: IconName;
  label: string;
  onClick?: () => void;
}

function IconButton({ t, icon, label, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl border-none bg-transparent p-0 transition-colors ${t.sidebarItem}`}
    >
      <Icon name={icon} />
    </button>
  );
}
