CREATE TABLE "subscription_invoices" (
	"stripe_invoice_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"plan_slug" text NOT NULL,
	"credits" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_invoices_valid_period" CHECK ("subscription_invoices"."credits" > 0 and "subscription_invoices"."period_end" > "subscription_invoices"."period_start")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_created_at" timestamp with time zone,
	"plan_slug" text,
	"status" text DEFAULT 'none' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"period_end" timestamp with time zone,
	"checkout_key" text,
	"checkout_plan_slug" text,
	"checkout_expires_at" timestamp with time zone,
	"checkout_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN "monthly_available_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN "monthly_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN "monthly_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "monthly_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "monthly_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_invoices_period_unique" ON "subscription_invoices" USING btree ("stripe_subscription_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_unique" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_customer_unique" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_monthly_range" CHECK ("credit_accounts"."monthly_available_credits" >= 0 and "credit_accounts"."monthly_available_credits" <= "credit_accounts"."available_credits");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_monthly_range" CHECK ("generation_jobs"."monthly_credits" >= 0 and "generation_jobs"."monthly_credits" <= "generation_jobs"."quoted_credits" and ("generation_jobs"."monthly_credits" = 0 or "generation_jobs"."monthly_period_end" is not null));