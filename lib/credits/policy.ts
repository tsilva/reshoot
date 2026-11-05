export function stripeTestCheckoutEnabledForEnvironment(input: {
  isDemoUser: boolean;
  paymentsMode?: string;
  stripeKey?: string;
  webhookSecret?: string;
}) {
  return input.isDemoUser && input.paymentsMode === "stripe_test"
    && /^(?:rk|sk)_test_\S+$/.test(input.stripeKey ?? "")
    && /^whsec_\S+$/.test(input.webhookSecret ?? "");
}
