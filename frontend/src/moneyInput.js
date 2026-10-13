/*
 * Monetary edit fields are stored as plain decimal strings. Grouping is
 * presentation-only: the API and existing validation never receive commas.
 * Keep blank distinct from an explicitly entered zero.
 */
const MONEY_DRAFT = /^\d*(?:\.\d{0,2})?$/;
const MONEY_VALUE = /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/;

export function parseMoneyDraft(value) {
  const clean = String(value ?? '').replace(/[$,\s]/g, '');
  return MONEY_DRAFT.test(clean) ? clean : null;
}

export function groupMoneyDraft(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  const parts = raw.split('.');
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length === 2 ? `${integer}.${parts[1]}` : integer;
}

export function displayMoneyValue(value, editing = false) {
  const raw = String(value ?? '').replaceAll(',', '');
  if (!raw) return '';
  if (editing || !MONEY_VALUE.test(raw)) return groupMoneyDraft(raw);

  const [integer, fraction = ''] = raw.split('.');
  const normalizedInteger = (integer || '0').replace(/^0+(?=\d)/, '');
  return `${groupMoneyDraft(normalizedInteger)}.${fraction.padEnd(2, '0')}`;
}

/* Preserve the caret's position in the digits/decimal point when grouping inserts commas. */
export function moneyCaretPosition(typedText, typedCaret, formattedText) {
  const meaningful = String(typedText).slice(0, typedCaret)
    .replace(/[$,\s]/g, '').length;
  if (!meaningful) return 0;

  let passed = 0;
  for (let index = 0; index < formattedText.length; index += 1) {
    if (formattedText[index] !== ',') passed += 1;
    if (passed === meaningful) return index + 1;
  }
  return formattedText.length;
}
