export const LEGAL_UPDATED = "4 November 2026";
export const LEGAL_CONTACT = "mouth-lip-campsite@duck.com";

export type LegalDocument = {
  title: string;
  description: string;
  sections: {
    id: string;
    title: string;
    paragraphs: string[];
    links?: { label: string; href: string }[];
  }[];
};

export const privacyPolicy: LegalDocument = {
  title: "Privacy policy",
  description: "How Reshoot handles account information, product photos and service data.",
  sections: [
    {
      id: "about",
      title: "Who is responsible",
      paragraphs: [
        `Reshoot is responsible for the personal data described in this policy. Contact ${LEGAL_CONTACT} about privacy, your data or this service.`,
      ],
    },
    {
      id: "data",
      title: "What we collect",
      paragraphs: [
        "Account information: your account identifier, email address and display name. Clerk manages authentication. When you choose Google sign-in, Google shares your basic profile and email with Clerk. Reshoot does not receive your Google password or request access to Gmail, Drive or contacts.",
        "Shoot information: photos you upload, shoot names, generation instructions, generated images, downloads and related processing records. We also store credit balances, generation usage and simulated purchase history. Do not upload personal documents, sensitive information or photos you are not entitled to use.",
        "Technical information: hosting and error-monitoring services process request, device, browser and diagnostic information to deliver the site and investigate failures. Information you send when contacting support is also processed.",
      ],
    },
    {
      id: "purposes",
      title: "How we use data",
      paragraphs: [
        "We use account and shoot data to sign you in, keep your shoots private to your account, generate and deliver images, maintain your wallet and answer support requests. This processing is necessary to provide the service you request. Without account information we cannot provide a private workspace.",
        "We use technical information for our legitimate interests in service reliability, security and preventing misuse, subject to your rights. We may retain information where necessary to meet a legal obligation or establish, exercise or defend legal claims. Where processing is based on consent, you may withdraw that consent without affecting earlier lawful processing.",
        "Google account data is used for authentication, account management, security and support. We do not sell Google user data, use it for advertising or use it to train AI models. Reshoot's use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.",
      ],
      links: [{ label: "Google API Services User Data Policy", href: "https://developers.google.com/terms/api-services-user-data-policy" }],
    },
    {
      id: "providers",
      title: "Who processes data",
      paragraphs: [
        "We use Vercel for hosting, Clerk for authentication, Neon for database services, Cloudflare R2 for private image storage, and Sentry for error monitoring. Generating images sends the selected photos and instructions through OpenRouter to the model providers that fulfil the request. Those providers process that content under their applicable terms; do not assume that every provider has the same retention or training policy.",
        "Service providers may process data outside your country, including outside the European Economic Area. Contact us for information about the providers involved in your request and applicable transfer safeguards. We may also disclose information when legally required or necessary to protect the service or other people's rights. Your private shoots are not published as public examples simply because you upload them.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies and analytics",
      paragraphs: [
        "Clerk uses cookies and similar browser storage to keep you signed in and protect sessions. Vercel Analytics measures site use. Where configured, Google Analytics also measures visits and may use cookies. Analytics can include pages visited, approximate location and device or browser information. Sentry records technical errors and performance information.",
        "You can manage cookies and site storage in your browser and use browser tracking controls. Blocking essential authentication storage can prevent sign-in. Contact us if you want to object to processing based on legitimate interests or ask about analytics data.",
      ],
    },
    {
      id: "retention",
      title: "Storage and deletion",
      paragraphs: [
        "Account and shoot information is retained while needed to provide your saved workspace. Deleting a shoot removes it from normal access; it does not guarantee immediate erasure of every stored copy. The service marks original and generated images for retention for at least 30 days after shoot deletion, and permanent cleanup can occur later. Copies used in past generations, backups, security records and credit-accounting records may remain where still necessary.",
        `To request account closure or erasure, email ${LEGAL_CONTACT} from your account email where possible. We may verify your identity before acting. We will explain any information that must be retained and the reason.`,
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      paragraphs: [
        "Depending on applicable law, you may request access, correction, erasure, restriction or portability of your personal data, object to processing based on legitimate interests, and withdraw consent where used. Contact us to exercise these rights. You may also complain to your local data-protection authority, including Portugal's CNPD where applicable.",
        "You can review or revoke Reshoot's Google connection in your Google Account. Revoking that connection does not by itself delete information already held by Reshoot; contact us for erasure.",
      ],
      links: [
        { label: "Google Account connections", href: "https://myaccount.google.com/connections" },
        { label: "CNPD", href: "https://www.cnpd.pt/" },
      ],
    },
    {
      id: "updates",
      title: "Changes to this policy",
      paragraphs: ["We will update this page when our data practices change and show the revision date above. Material changes will be brought to your attention where required."],
    },
  ],
};

export const termsOfService: LegalDocument = {
  title: "Terms of service",
  description: "The terms for using Reshoot's product-photography workspace and simulated credits.",
  sections: [
    {
      id: "service",
      title: "Using Reshoot",
      paragraphs: [
        `These terms govern your use of Reshoot, a product-photography service that stores reference photos and creates AI-generated studio views. Contact ${LEGAL_CONTACT} with questions. Use the service only if you can legally agree to these terms or have the necessary authorisation.`,
        "Keep your sign-in details secure and use only accounts and shoots you are entitled to access. Do not bypass access controls, interfere with the service, abuse generation resources or upload unlawful content.",
      ],
    },
    {
      id: "content",
      title: "Your photos and generated images",
      paragraphs: [
        "You retain your rights in uploaded content. You give Reshoot permission to store, copy and process that content, and to pass it to service providers, only as needed to operate the service and fulfil your requests. You must have the rights and permissions needed for your uploads, including any relevant privacy, trademark or other third-party rights.",
        "AI results can be inaccurate, distorted, incomplete or similar to other outputs. Review them before publishing or using them commercially, particularly product details, labels and claims. Reshoot does not guarantee exact physical geometry, accuracy, uniqueness, copyright protection or clearance of third-party rights. Keep your own copies of important originals and downloads.",
      ],
    },
    {
      id: "credits",
      title: "Simulated payments and credits",
      paragraphs: [
        "The current wallet uses simulated payments. No card is required and no money is charged. New accounts begin with zero credits. Test credits have no cash value, cannot be redeemed for money and do not represent a paid balance or a promise of future service.",
        "Generation reserves credits based on the quote shown before confirmation. Completed work consumes credits; failed or cancelled work is handled by the service's credit-accounting rules. Test credits still use real computing resources. Any future real-money purchases will require clearly stated pricing and terms before you pay; these terms do not authorise a charge, subscription or automatic recharge.",
      ],
    },
    {
      id: "availability",
      title: "Availability and account access",
      paragraphs: [
        "Features, models, limits and availability may change. Generation can fail or be delayed, and uninterrupted storage or service is not guaranteed. We may restrict access where reasonably necessary to protect the service, comply with law or address a breach of these terms.",
        "You can stop using Reshoot at any time and contact us to request account closure. Data retention and erasure are described in the privacy policy.",
      ],
    },
    {
      id: "rights",
      title: "Your legal rights",
      paragraphs: [
        "Nothing in these terms excludes liability or limits consumer, data-protection or other rights that cannot lawfully be excluded. Applicable mandatory law continues to apply. Contact us first if something is wrong so we can try to resolve it.",
      ],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      paragraphs: ["We will publish revised terms here with an updated date and notify you of material changes where required. Changes do not retrospectively authorise payments or remove rights you already have."],
    },
  ],
};
