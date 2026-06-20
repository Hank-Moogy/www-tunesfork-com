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
 * `tunesfork://` URL protocol. Custom protocols must be launched from
 * the top-level page in direct response to a user gesture; browsers often
 * block launches from hidden frames.
 */
export default function OpenInAbletonButton({
  projectId,
  versionId,
  className,
  disabled,
}: Props) {
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);
  const cleanupLaunchListenersRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    cleanupLaunchListenersRef.current?.();
  }, []);

  const handleClick = () => {
    trackButtonClick("project_open_in_ableton", "project", {
      project_id: projectId,
      version_id: versionId,
    });

    const url = `tunesfork://open-project/${projectId}${
      versionId ? `?version=${versionId}` : ""
    }`;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    cleanupLaunchListenersRef.current?.();

    // Opening the desktop app normally blurs or hides the browser. Cancel the
    // fallback toast when that happens instead of showing it after every click.
    const cancelFallback = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      cleanupLaunchListenersRef.current?.();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelFallback();
    };
    window.addEventListener("blur", cancelFallback, { once: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    cleanupLaunchListenersRef.current = () => {
      window.removeEventListener("blur", cancelFallback);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cleanupLaunchListenersRef.current = null;
    };

    timerRef.current = window.setTimeout(() => {
      cleanupLaunchListenersRef.current?.();
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
    }, 3500);

    // Top-level navigation is the most reliable custom-protocol launch in
    // Chrome and Safari. The web page remains open while the OS handles it.
    window.location.href = url;
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
