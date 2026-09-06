import AppSidebar from "../components/AppSidebar";
import MarathonCard from "../components/Marathon";
import { labelClass, useTheme } from "../theme";
import useNow from "../useNow";

/**
 * The marathon, on a page of its own.
 *
 * It used to be the last card on the dashboard, which worked while a run was a
 * strip and a checkbox and stopped working once it grew a day picker, a list per
 * day and a length you can change: a screen's worth of controls at the bottom of
 * a summary. Here it has the width for all of it, and the dashboard is back to
 * being four glances.
 */
export default function MarathonPage() {
  const { t } = useTheme();
  const now = useNow();

  return (
    // A route of its own rather than a carousel slide, so it sizes itself to the
    // viewport and scrolls inside — `body` has overflow hidden.
    <div
      className={`relative flex h-screen w-screen overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar />

      <div className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-16 pt-8 sm:px-8">
          <header className={`border-b pb-4 ${t.rule}`}>
            <p className={labelClass(t)}>Marathon</p>
          </header>

          <MarathonCard t={t} now={now} />
        </div>
      </div>
    </div>
  );
}
