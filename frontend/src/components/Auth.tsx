import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { api, ApiError, onAuthRequired, password } from "../api/client";

type AuthCtx = {
  required: boolean;
  unlocked: boolean;
  /** Resolves true once the user may write (password not required or entered correctly). */
  ensure: () => Promise<boolean>;
  lock: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config });
  const required = !!config?.password_required;
  const [unlocked, setUnlocked] = useState(() => !!password.get());
  const [open, setOpen] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(() => new Promise<boolean>((resolve) => {
    pending.current = resolve;
    setOpen(true);
  }), []);

  const ensure = useCallback(async () => {
    if (!required || unlocked) return true;
    return ask();
  }, [required, unlocked, ask]);

  useEffect(() => onAuthRequired(() => {
    password.clear();
    setUnlocked(false);
    setOpen(true);
  }), []);

  const close = (ok: boolean) => {
    setOpen(false);
    pending.current?.(ok);
    pending.current = null;
  };

  const lock = () => {
    password.clear();
    setUnlocked(false);
  };

  return (
    <Ctx.Provider value={{ required, unlocked: !required || unlocked, ensure, lock }}>
      {children}
      {open && <PasswordDialog onDone={(ok) => { if (ok) setUnlocked(true); close(ok); }} />}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}

function PasswordDialog({ onDone }: { onDone: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    password.set(value);
    try {
      await api.checkPassword();
      onDone(true);
    } catch (err) {
      password.clear();
      setError(err instanceof ApiError && err.status === 401);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onClick={() => onDone(false)}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card rise w-full max-w-sm p-6">
        <div className="mb-4 grid size-11 place-items-center rounded-full bg-leaf text-ink">
          <Lock size={20} />
        </div>
        <h2 className="display text-2xl">{t("auth.title")}</h2>
        <p className="mt-2 text-sm text-ink-2">{t("auth.body")}</p>
        <input
          autoFocus type="password" className="field mt-5" placeholder={t("auth.placeholder")}
          value={value} onChange={(e) => { setValue(e.target.value); setError(false); }}
        />
        {error && <p className="mt-2 text-sm text-sienna">{t("auth.wrong")}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onDone(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={!value || busy}>{t("auth.submit")}</button>
        </div>
      </form>
    </div>
  );
}
