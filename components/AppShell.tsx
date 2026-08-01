"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CaretDown,
  Coins,
  DoorOpen,
  FolderSimple,
  ShieldCheck,
  UserCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

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

const fallbackUser: AppShellUser = {
  displayName: "Reshoot Demo",
  email: "demo@reshoot.local",
  isDemo: true,
};

export function AppShell({
  children,
  currentUser = fallbackUser,
}: {
  children: ReactNode;
  currentUser?: AppShellUser;
}) {
  const pathname = usePathname();
  return (
    <div className="product-shell">
      <header className="product-header">
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
        <details className="user-menu">
          <summary className="user-menu-trigger" aria-label="Open user menu">
            <UserCircle className="user-menu-avatar" size={27} weight="duotone" />
            <span className="user-menu-trigger-copy">
              <strong>{currentUser.displayName}</strong>
              <span>
                {currentUser.availableCredits === undefined
                  ? "Demo workspace"
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
                <strong>{currentUser.isDemo ? "Demo session" : "Signed in"}</strong>
                <span>{currentUser.isDemo ? "Testing workspace" : "Personal workspace"}</span>
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
                <DoorOpen size={18} /> Exit demo workspace
              </Link>
            </nav>
            {currentUser.isDemo ? (
              <p>No password is used in this testing build.</p>
            ) : null}
          </section>
        </details>
      </header>
      {children}
    </div>
  );
}
