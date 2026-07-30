import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Metric, Theme, ThemeName } from "../types";

const COLLAPSED_STORAGE_KEY = "dashboard-sidebar-collapsed";

const RAIL_WIDTH = "w-[64px]";
const PANEL_WIDTH = "w-[236px]";

// 24×24 stroke icons drawn inline, so the sidebar needs no icon dependency.
const ICONS = {
  grid: (
    <>
      <rect x="3.6" y="3.6" width="7" height="7" rx="1.8" />
      <rect x="13.4" y="3.6" width="7" height="7" rx="1.8" />
      <rect x="3.6" y="13.4" width="7" height="7" rx="1.8" />
      <rect x="13.4" y="13.4" width="7" height="7" rx="1.8" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.6 3.8 8.2 12 12.8l8.2-4.6z" />
      <path d="M3.8 12.4 12 17l8.2-4.6" />
      <path d="M3.8 16.4 12 21l8.2-4.6" />
    </>
  ),
  activity: <path d="M3.4 12h3.9l2.5-6.4 4.2 12.8 2.5-6.4h4.1" />,
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
  plus: <path d="M12 6.6v10.8M6.6 12h10.8" />,
  chevron: <path d="m8.6 10.4 3.4 3.4 3.4-3.4" />,
  panel: (
    <>
      <rect x="3.4" y="4.4" width="17.2" height="15.2" rx="3" />
      <path d="M9.6 4.4v15.2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

/** A shortcut rendered under the metric list. */
export interface QuickLink {
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
  theme: ThemeName;
  onTheme: (theme: ThemeName) => void;
  metrics: Metric[];
  onOpenMetric: (id: number) => void;
  onManageMetrics: () => void;
  onNavigate: (to: string) => void;
  quickLinks?: QuickLink[];
}

export default function Sidebar({
  t,
  theme,
  onTheme,
  metrics,
  onOpenMetric,
  onManageMetrics,
  onNavigate,
  quickLinks = [],
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  // Below md the panel would eat most of the viewport, so it floats over the
  // content instead of squeezing it and a backdrop closes it again.
  const narrow = useMediaQuery("(max-width: 767px)");
  const expanded = !collapsed;
  const floating = narrow && expanded;

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // Persisting is best-effort; the choice still applies for this session.
    }
  }, [collapsed]);

  const openHelp = () => {
    if (collapsed) setCollapsed(false);
    setHelpOpen((open) => (collapsed ? true : !open));
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
        <div
          className={`flex items-center py-5 ${expanded ? "gap-2.5 px-4" : "justify-center px-0"}`}
        >
          {expanded && (
            <>
              <BrandMark t={t} />
              <span className="flex-1 truncate text-[0.92rem] font-semibold tracking-[-0.01em]">
                Morning Start
              </span>
            </>
          )}
          <IconButton
            t={t}
            icon="panel"
            label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-2">
          <NavItem
            t={t}
            icon="grid"
            label="Dashboard"
            collapsed={collapsed}
            active
          />

          <NavItem
            t={t}
            icon="layers"
            label="Metrics"
            collapsed={collapsed}
            expandedGroup={expanded && metricsOpen}
            onClick={() =>
              collapsed ? setCollapsed(false) : setMetricsOpen((open) => !open)
            }
            trailing={
              <Badge
                t={t}
                icon="plus"
                label="Add metric"
                onClick={onManageMetrics}
              />
            }
          />

          {expanded && metricsOpen && (
            // Capped so a long metric list scrolls on its own instead of
            // pushing the quick links out of the sidebar.
            <ul className="m-0 mb-1 max-h-[168px] list-none overflow-y-auto p-0 pl-[26px]">
              {metrics.map((metric) => (
                <li key={metric.id}>
                  <button
                    type="button"
                    onClick={() => onOpenMetric(metric.id)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-left text-[0.78rem] transition-colors ${t.sidebarItem}`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: t.accentSoft }}
                    />
                    <span className="truncate">{metric.name}</span>
                  </button>
                </li>
              ))}
              {metrics.length === 0 && (
                <p className={`m-0 px-2.5 py-1.5 text-[0.74rem] ${t.muted}`}>
                  No metrics yet
                </p>
              )}
            </ul>
          )}

          {quickLinks.map((link) => (
            <NavItem
              key={link.label}
              t={t}
              icon={link.icon}
              label={link.label}
              collapsed={collapsed}
              onClick={() => onNavigate(link.to)}
            />
          ))}
        </nav>

        <div className={`border-t px-3 py-3 ${t.rule}`}>
          {expanded && helpOpen && (
            <ul
              className={`m-0 mb-2 list-none rounded-xl p-3 text-[0.72rem] leading-relaxed ${t.sidebarCard} ${t.body}`}
            >
              <li>← → or swipe switches dashboard and body map.</li>
              <li className="mt-1.5">Pick a metric to open its own page.</li>
              <li className="mt-1.5">
                ← → or swipe again goes back from a metric page.
              </li>
              <li className="mt-1.5">+ next to Metrics adds or removes one.</li>
            </ul>
          )}
          <NavItem
            t={t}
            icon="help"
            label="Help & information"
            collapsed={collapsed}
            active={expanded && helpOpen}
            onClick={openHelp}
          />
          <NavItem
            t={t}
            icon={theme === "dark" ? "sun" : "moon"}
            label={theme === "dark" ? "Light background" : "Dark background"}
            collapsed={collapsed}
            onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
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
  onClick?: () => void;
  trailing?: ReactNode;
  expandedGroup?: boolean;
}

function NavItem({
  t,
  icon,
  label,
  collapsed,
  active,
  onClick,
  trailing,
  expandedGroup,
}: NavItemProps) {
  const interactive = Boolean(onClick);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        aria-expanded={expandedGroup === undefined ? undefined : expandedGroup}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 items-center rounded-xl border-none bg-transparent text-left transition-colors ${
          collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5"
        } ${active ? t.sidebarItemActive : t.sidebarItem} ${
          interactive ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <Icon name={icon} />
        {!collapsed && (
          <span
            className={`flex-1 truncate text-[0.83rem] ${active ? "font-medium" : ""}`}
          >
            {label}
          </span>
        )}
        {!collapsed && expandedGroup !== undefined && (
          <Icon
            name="chevron"
            className={`h-4 w-4 transition-transform duration-200 ${
              expandedGroup ? "" : "-rotate-90"
            }`}
          />
        )}
      </button>
      {!collapsed && trailing}
    </div>
  );
}

interface ButtonProps {
  t: Theme;
  icon: IconName;
  label: string;
  onClick?: () => void;
}

function Badge({ t, icon, label, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full border-none p-0 transition-colors ${t.sidebarBadge}`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  );
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
