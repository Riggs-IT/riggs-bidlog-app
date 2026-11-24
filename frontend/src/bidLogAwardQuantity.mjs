// Match the Data API Awarded quantity rule. Zero is a valid value, blank isn't.
export function isValidAwardQuantity(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  const number = Number(text.replaceAll(',', ''));
  return Number.isFinite(number) && number >= 0;
}

export function isTiltProject(value) {
  return typeof value === 'string' && value.trim().toUpperCase() === 'TILT';
}
export function isValidAwardPanelCount(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return false;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return false;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 1 && number <= 2147483647;
}
