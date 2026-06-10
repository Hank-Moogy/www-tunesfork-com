import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trackButtonClick } from "@/lib/analytics";
import { useNavigate } from "react-router-dom";

interface Props {
  projectId: string;
  versionId?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Hands the project off to the TunesFork desktop app via the
 * `tunesfork://` URL protocol. Triggers the protocol with a hidden
 * iframe (so the page never navigates away) and shows a dismissable
 * "Didn't open?" toast after 2.5s pointing at the desktop-app page.
 *
 * We deliberately do NOT auto-show a blocking dialog — visibility/blur
 * detection is unreliable on macOS Chrome/Safari and would interrupt
 * users who already have the app installed.
 */
export default function OpenInAbletonButton({
  projectId,
  versionId,
  className,
  disabled,
}: Props) {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const handleClick = () => {
    trackButtonClick("project_open_in_ableton", "project", {
      project_id: projectId,
      version_id: versionId,
    });

    const url = `tunesfork://open-project/${projectId}${
      versionId ? `?version=${versionId}` : ""
    }`;

    // Trigger via hidden iframe — works even when the protocol isn't registered
    // (no "page can't be displayed" error, no top-level navigation).
    if (!iframeRef.current) {
      const f = document.createElement("iframe");
      f.style.display = "none";
      document.body.appendChild(f);
      iframeRef.current = f;
    }
    iframeRef.current.src = url;

    // Non-blocking nudge after 2.5s. If the app did open, the user can
    // ignore/dismiss the toast — nothing is interrupted.
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      toast("Didn't open in Ableton?", {
        description: "Make sure the Tunesfork Sync desktop app is installed and running.",
        action: {
          label: "Get the app",
          onClick: () => {
            trackButtonClick("project_open_in_ableton_get_app", "project", {
              project_id: projectId,
            });
            navigate("/desktop-app");
          },
        },
        duration: 8000,
      });
    }, 2500);
  };

  return (
    <Button
      variant="outline"
      className={
        className ??
        "h-9 gap-2 rounded-xl bg-card/50 backdrop-blur-sm border-primary/40 text-primary hover:text-primary hover:bg-primary/10"
      }
      onClick={handleClick}
      disabled={disabled}
      title="Open this project in Ableton via the TunesFork desktop app"
    >
      Open in Ableton
    </Button>
  );
}
