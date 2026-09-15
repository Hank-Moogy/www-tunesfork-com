import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Bell, LogOut, User, Shield, BarChart3, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { trackButtonClick } from "@/lib/analytics";
import { cn } from "@/lib/utils";


/**
 * One navigation destination. Ambientic marks location with light rather
 * than with a filled control -- so the current route gets a lit underline
 * and full-contrast text, while the others recede to muted.
 */
function NavLink({
  to,
  label,
  badge,
  onSelect,
}: {
  to: string;
  label: string;
  badge?: string;
  onSelect?: () => void;
}) {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 items-center gap-1.5 px-3 text-sm transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {badge && (
        <span className="tf-lit rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wide">
          {badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-3 bottom-0 h-px bg-brand shadow-[0_0_10px_1px_hsl(var(--brand)/0.55)]"
        />
      )}
    </Link>
  );
}

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
    <nav className="tf-glass sticky top-0 z-50 border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6 lg:px-10">
        <Link
          to="/dashboard"
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <img src="/logo.png" alt="" className="tf-mark h-[18px] w-auto" />
          <span className="text-[15px] font-semibold tracking-tight">Tunesfork</span>
        </Link>

        {/* Primary navigation reads as text on a hairline rail, not as a row
            of competing buttons. The active route is marked by a lit
            underline rather than a filled pill. */}
        <div className="hidden items-center gap-1 md:flex">
          <NavLink to="/dashboard" label="Projects" onSelect={() => trackButtonClick("nav_dashboard", "navbar")} />
          <NavLink to="/desktop-app" label="Desktop" badge="NEW" onSelect={() => trackButtonClick("nav_desktop_app", "navbar")} />
          <NavLink to="/pricing" label="Pricing" onSelect={() => trackButtonClick("nav_pricing", "navbar")} />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg" asChild>
            <Link to="/dashboard" onClick={() => trackButtonClick("nav_notifications", "navbar")} aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-1 h-9 w-9 rounded-full"
                aria-label="Account menu"
              >
                <Avatar className="h-7 w-7 border border-[rgb(var(--edge-strong))]">
                  <AvatarFallback className="bg-[rgb(var(--film-3))] text-[11px] font-semibold text-foreground">
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
              <DropdownMenuItem onClick={() => { trackButtonClick("nav_profile", "navbar_menu"); navigate("/profile"); }}>
                <BarChart3 className="mr-2 h-4 w-4" />
                My stats
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { trackButtonClick("nav_billing", "navbar_menu"); navigate("/billing"); }}>
                <CreditCard className="mr-2 h-4 w-4" />
                Billing
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
