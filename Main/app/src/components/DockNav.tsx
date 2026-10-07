import { useLocation, useNavigate } from "react-router";
import {
  Home, Layers, Lock, LockOpen, FolderClock, Users, LogIn, LogOut, ScanEye,
} from "lucide-react";
import Dock from "@/components/react-bits/Dock/Dock";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function DockNav({ onAuthClick }: { onAuthClick: () => void }) {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const navItem = (path: string) => cn(
    pathname === path && "border-gold-500/40 bg-gold-500/15 shadow-[0_0_16px_-4px_rgba(212,175,55,0.45)]",
  );

  const items = [
    { icon: <Home className="h-5 w-5 text-stone-300" />, label: "Home", onClick: () => navigate("/"), className: navItem("/") },
    { icon: <Layers className="h-5 w-5 text-stone-300" />, label: "Methodology", onClick: () => navigate("/methodology"), className: navItem("/methodology") },
    { icon: <Lock className="h-5 w-5 text-gold-400" />, label: "Encrypt", onClick: () => navigate("/encrypt"), className: navItem("/encrypt") },
    { icon: <ScanEye className="h-5 w-5 text-gold-400" />, label: "Selective", onClick: () => navigate("/selective"), className: navItem("/selective") },
    { icon: <LockOpen className="h-5 w-5 text-gold-400" />, label: "Decrypt", onClick: () => navigate("/decrypt"), className: navItem("/decrypt") },
    { icon: <FolderClock className="h-5 w-5 text-stone-300" />, label: "History", onClick: () => navigate("/history"), className: navItem("/history") },
    { icon: <Users className="h-5 w-5 text-stone-300" />, label: "Team", onClick: () => navigate("/team"), className: navItem("/team") },
    username
      ? {
          icon: <LogOut className="h-5 w-5 text-stone-200" />,
          label: `Sign out (${username})`,
          onClick: signOut,
        }
      : {
          icon: <LogIn className="h-5 w-5 text-gold-300" />,
          label: "Sign in",
          onClick: onAuthClick,
        },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-28">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-coal-950/90 via-coal-950/40 to-transparent" />
      <div className="pointer-events-auto relative h-full">
        <Dock
          items={items}
          panelHeight={64}
          baseItemSize={46}
          magnification={64}
          distance={160}
          className="border-gold-500/20 bg-coal-900/90 shadow-[0_8px_40px_-8px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(212,175,55,0.1)] backdrop-blur-xl"
        />
      </div>
    </div>
  );
}
