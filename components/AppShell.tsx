"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderSimple, UserCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";

const navigation = [
  { href: "/projects", label: "Projects", icon: FolderSimple },
  { href: "/account", label: "Account", icon: UserCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
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
        <Link href="/account" className="credit-chip" aria-label="Open account credits">
          Demo account
        </Link>
      </header>
      {children}
    </div>
  );
}
