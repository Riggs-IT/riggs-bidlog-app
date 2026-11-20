// Match the Data API Awarded quantity rule. Zero is a valid value, blank isn't.
export function isValidAwardQuantity(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  const number = Number(text.replaceAll(',', ''));
  return Number.isFinite(number) && number >= 0;
}
