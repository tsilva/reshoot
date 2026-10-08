import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Coins,
  FolderSimple,
  ImagesSquare,
  ShieldCheck,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { findCurrentUser } from "@/lib/auth/current-user";
import { DEMO_STARTING_CREDITS } from "@/lib/auth/demo-session";
import { getCreditSummary } from "@/lib/credits/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo sign in | Reshoot",
  description: "Enter the Reshoot demo workspace and manage persistent product shoots.",
};

export default async function LoginPage() {
  const user = await findCurrentUser();
  const credits = user ? await getCreditSummary(user.id, user.isDemo) : null;

  return (
    <main className="login-page">
      <header className="login-header">
        <Image
          src="/brand/logo/wordmark.png"
          width={136}
          height={32}
          alt="Reshoot"
          priority
        />
        <span className="login-build-label">
          <ShieldCheck size={16} weight="duotone" /> Test build
        </span>
      </header>

      <div className="login-layout">
        <section className="login-showcase" aria-labelledby="login-showcase-title">
          <div>
            <div className="page-kicker">Persistent product photography</div>
            <h1 id="login-showcase-title">
              Every product shoot, ready when you come back.
            </h1>
            <p>
              Upload the photos you already have, create the missing angles and scenes,
              then keep every approved version together in one workspace.
            </p>
          </div>

          <figure className="login-product-proof">
            <Image
              src="/assets/sample-doll.png"
              width={1024}
              height={1024}
              alt="Cream textile doll photographed on a neutral studio set"
              priority
            />
            <figcaption>
              <span>Persistent project</span>
              <strong>Product identity stays anchored to your references.</strong>
            </figcaption>
          </figure>

          <div className="login-benefits" aria-label="Workspace features">
            <div>
              <FolderSimple size={21} weight="duotone" />
              <span><strong>Projects</strong> return to any product later</span>
            </div>
            <div>
              <ImagesSquare size={21} weight="duotone" />
              <span><strong>Versions</strong> preserve every generated result</span>
            </div>
          </div>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-access-label">Demo access</div>
          <h2 id="login-title">Welcome to Reshoot</h2>
          <p className="login-card-lede">
            {user ? "Return to your private testing workspace with your saved projects and remaining fake credits." : "Try your own private testing workspace with 1,000 fake credits. No payment is required."}
          </p>

          <div className="login-demo-identity">
            <UserCircle size={44} weight="duotone" />
            <div>
              <strong>{user?.displayName ?? "Reshoot Demo"}</strong>
              <span>{user?.email ?? "Private browser workspace"}</span>
            </div>
            <span className="demo-pill">Demo</span>
          </div>

          <div className="login-credit-row">
            <Coins size={20} weight="duotone" />
            <span>{user ? "Available test credits" : "Starting test credits"}</span>
            <strong>{(credits?.availableCredits ?? DEMO_STARTING_CREDITS).toLocaleString()}</strong>
          </div>

          <form action="/api/demo-session" method="post">
            <button type="submit" className="login-continue-button">
              {user ? "Continue to testing workspace" : "Start testing workspace"} <ArrowRight size={19} weight="bold" />
            </button>
          </form>
          {user ? (
            <Link href="/account" className="login-account-link">Review account and test credits</Link>
          ) : null}

          <div className="login-demo-note">
            <ShieldCheck size={18} weight="duotone" />
            <p>
              <strong>No password or payment is required.</strong>
              Your photos are separate from other visitors’ workspaces. Keep this browser’s
              cookies to return to your projects. Clearing cookies or using another browser
              starts a different workspace. Real authentication and billing are not enabled yet.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
