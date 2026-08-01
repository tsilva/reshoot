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
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo sign in | Reshoot",
  description: "Enter the Reshoot demo workspace and manage persistent product shoots.",
};

export default async function LoginPage() {
  const user = await resolveCurrentUser();
  const credits = await getCreditSummary(user.id, user.isDemo);

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
            Continue with the preconfigured account to inspect the complete product flow.
          </p>

          <div className="login-demo-identity">
            <UserCircle size={44} weight="duotone" />
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.email}</span>
            </div>
            <span className="demo-pill">Demo</span>
          </div>

          <div className="login-credit-row">
            <Coins size={20} weight="duotone" />
            <span>Available credits</span>
            <strong>{credits.availableCredits.toLocaleString()}</strong>
          </div>

          <Link href="/projects" className="login-continue-button">
            Continue to demo workspace <ArrowRight size={19} weight="bold" />
          </Link>
          <Link href="/account" className="login-account-link">
            Review account and credit packs
          </Link>

          <div className="login-demo-note">
            <ShieldCheck size={18} weight="duotone" />
            <p>
              <strong>No password or payment is required.</strong>
              This testing build always resolves the same demo user. Real authentication
              and production billing are not enabled yet.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
