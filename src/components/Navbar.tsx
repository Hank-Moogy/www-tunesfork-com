import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Bell, LogOut, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { trackButtonClick } from "@/lib/analytics";

export default function Navbar() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminRole();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    trackButtonClick("nav_signout", "navbar");
    await signOut();
    navigate("/auth");
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-white/40">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 lg:px-10">
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src="/logo.png" alt="TunesFork" className="h-8 w-auto" />
          <span className="text-lg font-bold tracking-tight">TunesFork</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/pricing" onClick={() => trackButtonClick("nav_pricing", "navbar")}>Pricing</Link>
          </Button>
          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link to="/dashboard" onClick={() => trackButtonClick("nav_notifications", "navbar")}>
              <Bell className="h-4 w-4" />
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/20 text-xs text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="text-muted-foreground text-xs" disabled>
                {user?.email}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { trackButtonClick("nav_dashboard", "navbar_menu"); navigate("/dashboard"); }}>
                <User className="mr-2 h-4 w-4" />
                Dashboard
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => { trackButtonClick("nav_admin", "navbar_menu"); navigate("/admin"); }}>
                  <Shield className="mr-2 h-4 w-4" />
                  Backoffice
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
