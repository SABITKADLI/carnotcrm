"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowUpRight, SearchX } from "lucide-react";
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const value = String(children).toLowerCase();
  return (
    <span
      className={`badge ${tone || (["ready", "paid", "received", "accepted", "published"].includes(value) ? "green" : ["urgent", "overdue", "error", "cancelled"].includes(value) ? "red" : ["production", "stitching", "partial", "high", "quality"].includes(value) ? "amber" : "neutral")}`}
    >
      {String(children).replaceAll("_", " ")}
    </span>
  );
}
export function Empty({
  title = "Nothing here yet",
  children,
  action,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <SearchX size={30} strokeWidth={1} />
      <h3>{title}</h3>
      <p>{children || "Create your first record to get started."}</p>
      {action}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`drawer ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <header>
        <div>
          <span className="eyebrow">CARNOT STUDIO</span>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>
      <div className="drawer-content">{children}</div>
    </dialog>
  );
}
export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress-group">
      {label && (
        <span>
          {label}
          <b>{Math.round(value)}%</b>
        </span>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Production progress"}
      >
        <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}
export function SectionTitle({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href}>
      {children}
      <ArrowUpRight size={15} />
    </a>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
