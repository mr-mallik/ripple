"use client";

import { useRef, type ReactNode } from "react";
import Image from "next/image";
import Icon, { type IconName } from "./Icon";
import type { CallTarget } from "@/lib/contacts";

/** A screen with a back button, optional header action, title and subtitle. */
export function Page({
  title,
  subtitle,
  onBack,
  action,
  onTitleLongPress,
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  onBack: () => void;
  action?: ReactNode;
  onTitleLongPress?: () => void;
  children: ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const start = () => {
    if (onTitleLongPress) timer.current = window.setTimeout(onTitleLongPress, 650);
  };
  const stop = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return (
    <>
      <header className="page-header">
        <button className="icon-button" onClick={onBack} aria-label="Go back">
          <Icon name="arrow" />
        </button>
        {action ?? <span className="header-spacer" />}
      </header>
      {(title || subtitle) && (
        <div className="page-title">
          {title && (
            <h1
              className={onTitleLongPress ? "long-press-title" : ""}
              onPointerDown={start}
              onPointerUp={stop}
              onPointerLeave={stop}
              onPointerCancel={stop}
              onContextMenu={(e) => onTitleLongPress && e.preventDefault()}
            >
              {title}
            </h1>
          )}
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
      <main className="page-main">{children}</main>
    </>
  );
}

export function BottomAction({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="bottom-action">
      <button className="primary coral" disabled={disabled} onClick={onClick}>
        {label}
        <Icon name="chevron" />
      </button>
    </div>
  );
}

export function CallCard({ c }: { c: CallTarget }) {
  const action = c.action ?? "phone";
  const body = (
    <>
      <span className="call-card-copy">
        {c.eyebrow && <small className="call-card-eyebrow">{c.eyebrow}</small>}
        <strong>{c.title}</strong>
        <span>{c.detail}</span>
      </span>
      {c.href && (
        <span className="call-action">
          <Icon name={action} size={22} />
          <small>{action === "message" ? "Message" : "Call"}</small>
        </span>
      )}
    </>
  );
  if (!c.href) {
    return (
      <div className="call-card is-disabled" aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <a
      className={`call-card ${c.emergency ? "emergency" : ""}`}
      href={c.href}
      aria-label={`${action === "message" ? "Message" : "Call"} ${c.title}`}
    >
      {body}
    </a>
  );
}

export type Section = "home" | "report" | "walk" | "notice" | "support" | "profile";

const NAV: { id: Section; label: string; icon: IconName; wide?: boolean }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "report", label: "Report", icon: "help", wide: true },
  { id: "walk", label: "Walk together", icon: "walk", wide: true },
  { id: "notice", label: "Notices", icon: "bell" },
  { id: "support", label: "Support", icon: "people", wide: true },
  { id: "profile", label: "Profile", icon: "person" },
];

/**
 * Main navigation. A bottom bar on phones (Home, Notices, Profile) shown on
 * top-level screens, and a full sidebar on larger screens.
 */
export function AppNav({
  section,
  hasNotices,
  subScreen,
  onSelect,
}: {
  section: Section;
  hasNotices: boolean;
  subScreen: boolean;
  onSelect: (s: Section) => void;
}) {
  return (
    <nav className={`bottom-nav app-nav ${subScreen ? "nav-sub" : ""}`} aria-label="Main navigation">
      <Image
        src="/brand/ripple-logo.png"
        alt="Ripple: women's safety matters"
        width={940}
        height={478}
        className="nav-logo"
        priority
      />
      {NAV.map((n) => (
        <button
          key={n.id}
          className={`${section === n.id ? "active" : ""} ${n.wide ? "wide-only" : ""}`}
          onClick={() => onSelect(n.id)}
          aria-current={section === n.id ? "page" : undefined}
          aria-label={n.id === "notice" && hasNotices ? "Notices, new safety notice nearby" : undefined}
        >
          <Icon name={n.icon} />
          <span>{n.label}</span>
          {n.id === "notice" && hasNotices && <i />}
        </button>
      ))}
      <a className="nav-999 wide-only" href="tel:999">
        <Icon name="phone" size={18} />
        <span>In danger? Call 999</span>
      </a>
    </nav>
  );
}

export function SecurityButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="security-button" onClick={onClick}>
      <Icon name="phone" size={15} />
      Get help
    </button>
  );
}

/** A bottom sheet over a dimmed backdrop. Tapping the backdrop closes it. */
export function Sheet({
  id,
  title,
  intro,
  className = "",
  onClose,
  children,
}: {
  id: string;
  title?: ReactNode;
  intro?: ReactNode;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`bottom-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? id : undefined}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <span className="sheet-handle" />
        {title && <h2 id={id}>{title}</h2>}
        {intro && <p>{intro}</p>}
        {children}
      </div>
    </div>
  );
}

export function Radio() {
  return (
    <span className="choice-radio">
      <span />
    </span>
  );
}

export type AvatarColor = "mint" | "blue" | "sand";

export function Avatar({ initials, color, large = false }: { initials: string; color: AvatarColor; large?: boolean }) {
  return <span className={`avatar ${color} ${large ? "large" : ""}`}>{initials}</span>;
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2);
  return s.toUpperCase() || "?";
}
