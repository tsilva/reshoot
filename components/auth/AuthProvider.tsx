import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider signInUrl="/login" signUpUrl="/sign-up" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
      {children}
    </ClerkProvider>
  );
}
