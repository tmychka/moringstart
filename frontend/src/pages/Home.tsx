import Jarvis from "../components/Jarvis";
import { useTheme } from "../theme";
import useNow from "../useNow";

export default function Home() {
  const { t } = useTheme();
  const now = useNow();

  return (
    // No background of its own: the app-wide treatment is painted on one fixed
    // layer behind everything (see index.css), and a ground here would cover it.
    // The whole screen is a single panel, which `Jarvis` draws.
    <div className={`relative h-screen w-screen overflow-hidden ${t.page}`}>
      <Jarvis t={t} now={now} />
    </div>
  );
}
