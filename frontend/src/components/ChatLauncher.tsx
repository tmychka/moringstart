/**
 * The way into the chat, from anywhere.
 *
 * Mounted once at the root rather than inside a panel, because the question you
 * want to ask rarely arrives on the screen that can answer it — you think "how
 * many steps this week" while reading English, and the point of a chat that
 * reads every area is that you never have to navigate to the area first.
 *
 * The button sits in the bottom-right corner, out of every page's flow.
 */
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Chat from "./Chat";
import { useTheme } from "../theme";
import useNow from "../useNow";
import { useCommit, useSignals } from "../useTracking";

export default function ChatLauncher() {
  const { t } = useTheme();
  const now = useNow();
  const signals = useSignals(now);
  const commit = useCommit(now);

  const [open, setOpen] = useState(false);
  // Stable, so the dialog's key handler is not torn down and re-run every time
  // the clock ticks a new `now` through here.
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <>
      {!open &&
        createPortal(
          <button
            type="button"
            aria-label="Спитати J.A.R.V.I.S."
            title="Спитати J.A.R.V.I.S."
            onClick={() => setOpen(true)}
            className={`fixed bottom-6 right-6 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border transition-colors ${t.popover} ${t.iconBtn}`}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </button>,
          document.body
        )}

      {open && (
        <Chat
          t={t}
          signals={signals}
          onClose={close}
          onCommit={commit.fromChat}
        />
      )}
    </>
  );
}
