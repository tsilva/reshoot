import Link from "next/link";
import { ArrowRight, User } from "@phosphor-icons/react/ssr";
import { HomeFrame } from "@/components/HomeFrame";

export function PublicHome() {
  return (
    <HomeFrame
      brandHref="#"
      prefetchLinks={false}
      accountControls={<Link className="home-wallet-button" href="/login" prefetch={false}>Sign in <User size={18} /></Link>}
      startAction={<Link className="home-primary-button" href="/login" prefetch={false}><span>Add photos</span><ArrowRight size={20} /></Link>}
      startNote="Sign in to save your shoots. Explore the samples for free."
    />
  );
}
