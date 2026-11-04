"use client";

import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { usePathname } from "next/navigation";
import {
  CaretDown,
  Coins,
  DoorOpen,
  FolderSimple,
  ShieldCheck,
  UserCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

const navigation = [
  { href: "/projects", label: "Projects", icon: FolderSimple },
  { href: "/account", label: "Account", icon: UserCircle },
];

export type AppShellUser = {
  displayName: string;
  email: string;
  isDemo: boolean;
  availableCredits?: number;
};

export function AppShell({
  children,
  currentUser = null,
}: {
  children: ReactNode;
  currentUser?: AppShellUser | null;
}) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    const shell = shellRef.current;
    if (!header || !shell) return;
    const updateHeight = () => shell.style.setProperty("--product-header-height", `${header.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="product-shell" ref={shellRef}>
      <header className="product-header" ref={headerRef}>
        <Link href="/projects" className="brand-link" aria-label="Reshoot projects">
          <Image
            src="/brand/logo/wordmark.png"
            width={136}
            height={32}
            alt="Reshoot"
            priority
          />
        </Link>
        <nav className="product-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const selected = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`product-nav-link${selected ? " is-active" : ""}`}
                aria-current={selected ? "page" : undefined}
              >
                <Icon size={18} weight={selected ? "fill" : "regular"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {currentUser ? <details className="user-menu">
          <summary className="user-menu-trigger" aria-label="Open user menu">
            <UserCircle className="user-menu-avatar" size={27} weight="duotone" />
            <span className="user-menu-trigger-copy">
              <strong>{currentUser.displayName}</strong>
              <span>
                {currentUser.availableCredits === undefined
                  ? "Your account"
                  : `${currentUser.availableCredits.toLocaleString()} credits`}
              </span>
            </span>
            <CaretDown className="user-menu-caret" size={14} weight="bold" />
          </summary>
          <section className="user-menu-panel" aria-label="Signed-in user">
            <header>
              <UserCircle size={38} weight="duotone" />
              <div>
                <strong>{currentUser.displayName}</strong>
                <span>{currentUser.email}</span>
              </div>
            </header>
            <div className="demo-session-status">
              <ShieldCheck size={17} weight="duotone" />
              <div>
                <strong>Signed in</strong>
                <span>{currentUser.isDemo ? "Simulated payments" : "Personal workspace"}</span>
              </div>
            </div>
            {currentUser.availableCredits !== undefined ? (
              <Link href="/account" className="user-menu-balance">
                <Coins size={19} weight="duotone" />
                <span>Available credits</span>
                <strong>{currentUser.availableCredits.toLocaleString()}</strong>
              </Link>
            ) : null}
            <nav aria-label="User menu navigation">
              <Link href="/account">
                <UserCircle size={18} /> Account & credits
              </Link>
              <Link href="/projects">
                <FolderSimple size={18} /> Product projects
              </Link>
              <Link href="/login" className="exit-demo-link">
                <DoorOpen size={18} /> Back to welcome
              </Link>
            </nav>
            {currentUser.isDemo ? (
              <p>Projects and test credits are private to your account.</p>
            ) : null}
            <AccountMenu />
          </section>
        </details> : <Link href="/login" className="home-wallet-button">Sign in</Link>}
      </header>
      {children}
    </div>
  );
}
