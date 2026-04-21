import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Send, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { trackButtonClick, trackShareCompleted } from "@/lib/analytics";

interface ShareAfterUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl?: string;
}

export default function ShareAfterUploadModal({ open, onOpenChange, shareUrl }: ShareAfterUploadModalProps) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!shareUrl) return;
    trackButtonClick("share_after_upload_copy_link", "share_after_upload_modal");
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInvite = () => {
    if (!email) return;
    trackButtonClick("share_after_upload_invite", "share_after_upload_modal");
    toast.success(`Invitation sent to ${email}`);
    setEmail("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-accent" />
            <DialogTitle>Project saved!</DialogTitle>
          </div>
          <DialogDescription>Share your project or invite a collaborator.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Email invite */}
          <div className="flex gap-2">
            <Input
              placeholder="Enter email to invite"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <Button size="icon" onClick={handleInvite} disabled={!email}>
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {/* Copy link */}
          {shareUrl && (
            <Button variant="outline" className="w-full gap-2" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy share link"}
            </Button>
          )}

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => { trackButtonClick("share_after_upload_dismiss", "share_after_upload_modal"); onOpenChange(false); }}>
            Skip for now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
