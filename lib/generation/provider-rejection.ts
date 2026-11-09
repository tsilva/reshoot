// Convert untrusted historical provider text into fixed diagnostic categories.
// Never return the text itself: providers may echo prompts or other private data.
export function providerRejectionReason(message: string | null) {
  const text = (message ?? "").slice(0, 10_000);
  if (/\b(?:budget|credit|spending|spend|key)\s+(?:limit|cap)\s+(?:(?:has been|is)\s+)?(?:exceeded|exhausted|reached)\b|\binsufficient credits\b/i.test(text)) {
    return "budget_limit" as const;
  }
  if (/\b(?:content moderation|content policy|safety policy|moderation flagged)\b/i.test(text)) {
    return "content_policy" as const;
  }
  if (/\b(?:model|provider)\b.{0,80}\b(?:not allowed|not permitted|not authorized|not available for this key)\b/i.test(text)) {
    return "access_policy" as const;
  }
  return "unknown" as const;
}
