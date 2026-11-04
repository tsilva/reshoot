export function demoCheckoutEnabledForEnvironment(input: {
  isDemoUser: boolean;
  nodeEnv?: string;
  vercelEnv?: string;
  paymentsMode?: string;
}) {
  if (!input.isDemoUser) return false;
  if (input.paymentsMode !== undefined && input.paymentsMode !== "simulated") return false;
  if (input.vercelEnv === "production") return input.paymentsMode === "simulated";
  return (
    input.vercelEnv === undefined ||
    input.vercelEnv === "development" ||
    input.vercelEnv === "preview" ||
    input.nodeEnv !== "production"
  );
}
