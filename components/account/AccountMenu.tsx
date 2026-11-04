"use client";

import { UserButton, useClerk } from "@clerk/nextjs";
import { Coins } from "@phosphor-icons/react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { CreditSummary } from "@/lib/api/types";

const CreditsPage = dynamic(() => import("./CreditsPage").then((module) => module.CreditsPage));

export type AccountMenuHandle = { openCredits: () => void };

export function AccountMenu({ ref, initialWalletOpen = false, isDemo, onCreditsChange }: {
  ref?: Ref<AccountMenuHandle>;
  initialWalletOpen?: boolean;
  isDemo: boolean;
  onCreditsChange?: (credits: CreditSummary) => void;
}) {
  const clerk = useClerk();
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [icon, setIcon] = useState<HTMLDivElement | null>(null);
  const openedInitialWallet = useRef(false);
  // Share the same custom page between the avatar menu and direct shortcuts.
  // Portals retain React state while Clerk owns the panel DOM.
  const customPages = useMemo(() => [{
    label: "Credits",
    url: "credits",
    mount: (element: HTMLDivElement) => setContent(element),
    unmount: () => setContent(null),
    mountIcon: (element: HTMLDivElement) => setIcon(element),
    unmountIcon: () => setIcon(null),
  }], []);
  const openCredits = useCallback(() => {
    clerk.openUserProfile({ customPages, __experimental_startPath: "/credits" });
  }, [clerk, customPages]);

  useImperativeHandle(ref, () => ({ openCredits }), [openCredits]);

  useEffect(() => {
    if (!initialWalletOpen || !clerk.loaded || openedInitialWallet.current) return;
    openedInitialWallet.current = true;
    openCredits();
    const url = new URL(window.location.href);
    url.searchParams.delete("wallet");
    if (url.hash === "#wallet") url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }, [initialWalletOpen, clerk.loaded, openCredits]);

  return <>
    <UserButton>
      <UserButton.UserProfilePage label="Credits" url="credits" labelIcon={<Coins size={18} aria-hidden="true" />}>
        <CreditsPage isDemo={isDemo} onCreditsChange={onCreditsChange} />
      </UserButton.UserProfilePage>
    </UserButton>
    {content ? createPortal(<CreditsPage isDemo={isDemo} onCreditsChange={onCreditsChange} />, content) : null}
    {icon ? createPortal(<Coins size={18} aria-hidden="true" />, icon) : null}
  </>;
}
