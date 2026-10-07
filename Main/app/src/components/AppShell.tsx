import { useState } from "react";
import { Outlet } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "react-router";
import { AuthProvider } from "@/lib/auth";
import { Header } from "@/sections/Header";
import { Footer } from "@/sections/Footer";
import { DockNav } from "@/components/DockNav";
import { AuthDialog } from "@/components/AuthDialog";

export default function AppShell() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "signup" | null>(null);
  const openAuth = (mode?: "login" | "signup") => {
    setAuthInitialMode(mode ?? null);
    setAuthOpen(true);
  };

  const location = useLocation();

  return (
    <AuthProvider>
      <div className="bg-noise min-h-screen bg-coal-950 text-stone-100 antialiased">
        <Header onAuthClick={() => openAuth("login")} />
        <main className="relative min-h-[70vh] px-4 pb-28 pt-20 sm:px-6 sm:pt-24">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            >
              <Outlet context={{ openAuth }} />
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
        <DockNav onAuthClick={() => openAuth("login")} />
        <AuthDialog
          open={authOpen}
          initialMode={authInitialMode}
          onOpenChange={setAuthOpen}
        />
      </div>
    </AuthProvider>
  );
}
