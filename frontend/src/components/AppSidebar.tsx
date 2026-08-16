import { useLocation, useNavigate } from "react-router-dom";
import Sidebar, { type SidebarLink } from "./Sidebar";
import { AREAS } from "../areas";
import { useTheme } from "../theme";

// Every area, in the order the list declares them — the sidebar is a flat list
// of the app's sections, so this needs no grouping and nothing to expand.
const AREA_LINKS: SidebarLink[] = AREAS.map((area) => ({
  icon: area.icon,
  label: area.label,
  to: `/${area.slug}`,
}));

interface AppSidebarProps {
  /** `minimal` drops the area list, leaving the brand row and the theme switch. */
  variant?: "full" | "minimal";
  /**
   * Entries for a minimal sidebar, so a page can offer its own sections.
   * Ignored in full mode, which lists the areas.
   */
  links?: SidebarLink[];
}

/**
 * The sidebar with everything it needs already wired: the links, the theme
 * switch and the route it is on. Every page that wants a sidebar renders this
 * one, so they all get the same one.
 *
 * Must sit inside a positioned element — the floating panel below `md` is
 * absolutely positioned against it.
 */
export default function AppSidebar({
  variant = "full",
  links = [],
}: AppSidebarProps = {}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, treatment, scheme, setTreatment, setScheme } = useTheme();

  return (
    <Sidebar
      t={t}
      treatment={treatment}
      scheme={scheme}
      onTreatment={setTreatment}
      onScheme={setScheme}
      activePath={pathname}
      onNavigate={navigate}
      links={variant === "full" ? AREA_LINKS : links}
      variant={variant}
    />
  );
}
