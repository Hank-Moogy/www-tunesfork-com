import { useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * `tunesfork://` URL protocol. If the OS doesn't pick up the deep link
 * within ~1.5s (i.e. the app isn't installed), shows a fallback dialog
 * pointing to the desktop app download page.
 */
export default function OpenInAbletonButton({
  projectId,
  versionId,
  className,
  disabled,
}: Props) {
  const [showFallback, setShowFallback] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);

  const handleClick = () => {
    trackButtonClick("project_open_in_ableton", "project", {
      project_id: projectId,
      version_id: versionId,
    });

    const url = `tunesfork://open-project/${projectId}${
      versionId ? `?version=${versionId}` : ""
    }`;

    let handedOff = false;
    const onHide = () => {
      if (document.visibilityState === "hidden") handedOff = true;
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onHide);

    // Trigger the protocol handoff
    window.location.href = url;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onHide);
      if (!handedOff) setShowFallback(true);
    }, 1500);
  };

  return (
    <>
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
        <Music2 className="h-4 w-4" />
        Open in Ableton
      </Button>

      <Dialog open={showFallback} onOpenChange={setShowFallback}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desktop app required</DialogTitle>
            <DialogDescription>
              Opening a project directly in Ableton needs the TunesFork
              desktop app. Install it once and this button will hand the
              project straight to Ableton from any browser.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowFallback(false)}>
              Not now
            </Button>
            <Button
              onClick={() => {
                trackButtonClick("project_open_in_ableton_get_app", "project", {
                  project_id: projectId,
                });
                navigate("/desktop-app");
              }}
            >
              Get the app
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
