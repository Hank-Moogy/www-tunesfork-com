import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";
import { getInAppBrowserName, tryOpenInExternalBrowser } from "@/lib/inAppBrowser";
import { ExternalLink, AlertTriangle } from "lucide-react";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("tab") !== "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  usePageView("auth");

  const inAppBrowser = useMemo(() => getInAppBrowserName(), []);

  // Persist invite token across the auth round-trip (incl. Google OAuth)
  const inviteToken = searchParams.get("invite");
  if (inviteToken) {
    try { sessionStorage.setItem("tf_pending_invite", inviteToken); } catch {}
  }

  const handleOpenExternal = async () => {
    const result = await tryOpenInExternalBrowser(window.location.href);
    if (result === "copied") {
      toast({
        title: "Link copied",
        description: "Paste it into Chrome or Safari to continue with Google sign-in.",
      });
    } else if (result === "failed") {
      toast({
        title: "Couldn't copy link",
        description: "Tap the menu (⋯) in this app and choose 'Open in browser'.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    trackButtonClick(isLogin ? "auth_submit_signin" : "auth_submit_signup", "auth");
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link to verify your account.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    trackButtonClick("auth_google_continue", "auth");
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            TunesFork
          </h1>
          <img src="/logo.png" alt="TunesFork" className="h-16 w-auto mx-auto" />
          <p className="text-sm text-muted-foreground">
            your ableton collaborative workspace
          </p>
        </div>

        {inAppBrowser && (
          <Alert className="border-pastel-orange/40 bg-pastel-orange/5">
            <AlertTriangle className="h-4 w-4 text-pastel-orange" />
            <AlertTitle className="text-sm">Open in your browser to use Google sign-in</AlertTitle>
            <AlertDescription className="text-xs space-y-2">
              <p>
                You're viewing this inside {inAppBrowser}'s in-app browser. Google blocks sign-in here.
                Tap the menu (⋯ or ⋮) and choose <strong>"Open in Chrome"</strong> or <strong>"Open in Safari"</strong>,
                or sign up with email below.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleOpenExternal}
                className="h-7 text-xs mt-2"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Copy link to open in browser
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-secondary border-border"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        {/* Google */}
        <Button
          variant="outline"
          className="w-full border-border"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        {/* Toggle */}
        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              trackButtonClick("auth_toggle_mode", "auth", { to: isLogin ? "signup" : "signin" });
              setIsLogin(!isLogin);
            }}
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}
