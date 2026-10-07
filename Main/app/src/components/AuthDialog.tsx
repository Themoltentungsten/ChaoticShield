import { useEffect, useState } from "react";
import { KeyRound, Loader2, LogIn, UserPlus, User, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Stepper, { Step } from "@/components/react-bits/Stepper/Stepper";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

export function AuthDialog({
  open,
  onOpenChange,
  initialMode = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialMode?: Mode | null;
}) {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1);
  const [stepperKey, setStepperKey] = useState(0);

  // deep-link into a mode: "signup" CTAs open with Sign up pre-selected
  useEffect(() => {
    if (open && initialMode) setMode(initialMode);
  }, [open, initialMode]);

  const usernameValid = USERNAME_RE.test(username);
  const passwordValid = mode === "login" ? password.length > 0 : password.length >= 6;
  const confirmValid = mode === "login" ? true : password === confirm && confirm.length > 0;

  // per-step gate: Continue only works when the current step's fields are valid
  const stepGate: Record<number, boolean> = {
    1: true,
    2: usernameValid,
    3: passwordValid && confirmValid,
  };
  const nextDisabled = busy || !(stepGate[step] ?? true);

  const reset = () => {
    setMode("login");
    setUsername("");
    setPassword("");
    setConfirm("");
    setError(null);
    setBusy(false);
    setStep(1);
    setStepperKey((k) => k + 1);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  // Final step: send to the server. A failure keeps the user exactly where
  // they are (step 3) with an inline error — nothing gets reset.
  const submit = async () => {
    setError(null);
    if (!stepGate[3]) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      signIn(data.token, data.username);
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="border-gold-500/20 bg-coal-950 text-stone-100 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.9)] sm:max-w-lg">
        <DialogHeader className="flex flex-row items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10">
            <ShieldCheck className="h-[18px] w-[18px] text-gold-400" />
          </span>
          <div>
            <DialogTitle className="font-display text-lg font-semibold tracking-wide text-stone-100">
              {mode === "login" ? "Sign in to ChaoticShield" : "Create your account"}
            </DialogTitle>
            <p className="mt-0.5 text-[11px] text-stone-500">
              {mode === "login"
                ? "Welcome back — access your encryption history."
                : "Three short steps. Your password is stored only as a scrypt hash."}
            </p>
          </div>
        </DialogHeader>

        <Stepper
          key={stepperKey}
          initialStep={1}
          onStepChange={setStep}
          onFinalStepCompleted={submit}
          backButtonText="Back"
          nextButtonText="Continue"
          nextButtonProps={{ disabled: nextDisabled }}
          stepCircleContainerClassName="border-0 bg-transparent shadow-none rounded-none"
        >
          <Step>
            <p className="mb-3 text-sm text-stone-400">Choose how you want to continue.</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { m: "login" as Mode, icon: LogIn, title: "Sign in", sub: "Existing account" },
                { m: "signup" as Mode, icon: UserPlus, title: "Sign up", sub: "New account" },
              ]).map((o) => (
                <button
                  key={o.m}
                  onClick={() => switchMode(o.m)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-4 transition-colors",
                    mode === o.m
                      ? "border-gold-400/60 bg-gold-400/10 text-gold-300"
                      : "border-stone-800 bg-coal-950/60 text-stone-400 hover:border-stone-600",
                  )}
                >
                  <o.icon className="h-5 w-5" />
                  <span className="text-sm font-semibold">{o.title}</span>
                  <span className="text-[11px] text-stone-500">{o.sub}</span>
                </button>
              ))}
            </div>
          </Step>

          <Step>
            <Label htmlFor="auth-user" className="mb-2 flex items-center gap-1.5 text-sm text-stone-400">
              <User className="h-3.5 w-3.5 text-gold-500/80" /> Username
            </Label>
            <Input
              id="auth-user"
              autoFocus
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              placeholder="e.g. yash.raut"
              className="rounded-lg border-stone-700 bg-coal-900 text-stone-100 placeholder:text-stone-600"
            />
            <p className={cn("mt-2 text-xs", usernameValid || !username ? "text-stone-500" : "text-red-400")}>
              3–24 letters, digits, dots, dashes or underscores.
            </p>
            {!usernameValid && username.length > 0 && (
              <p className="mt-1 text-xs text-red-400">Please fix the username to continue.</p>
            )}
          </Step>

          <Step>
            <Label htmlFor="auth-pass" className="mb-2 flex items-center gap-1.5 text-sm text-stone-400">
              <KeyRound className="h-3.5 w-3.5 text-gold-500/80" /> Password
            </Label>
            <Input
              id="auth-pass"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              className="rounded-lg border-stone-700 bg-coal-900 text-stone-100 placeholder:text-stone-600"
            />
            {mode === "signup" && (
              <>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError(null);
                  }}
                  placeholder="Confirm password"
                  className="mt-2 rounded-lg border-stone-700 bg-coal-900 text-stone-100 placeholder:text-stone-600"
                />
                {password.length > 0 && password.length < 6 && (
                  <p className="mt-2 text-xs text-amber-400/90">Password must be at least 6 characters.</p>
                )}
                {confirm.length > 0 && !confirmValid && (
                  <p className="mt-1 text-xs text-red-400">Passwords do not match.</p>
                )}
              </>
            )}
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            {busy && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gold-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Contacting server…
              </p>
            )}
          </Step>
        </Stepper>

        <p className="px-2 pb-1 text-center text-[11px] text-stone-500">
          Accounts keep your encryption history on this machine.
        </p>
      </DialogContent>
    </Dialog>
  );
}
