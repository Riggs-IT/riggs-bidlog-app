const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];


const STATE_BY_CODE = new Map(
  US_STATES.map(([code, name]) => [code, { code, name }]),
);

const STATE_BY_NAME = new Map(
  US_STATES.map(([code, name]) => [name.toUpperCase(), { code, name }]),
);


export function normalizeBidLogState(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    return '';
  }

  const upper = text.toUpperCase();
  const match = STATE_BY_CODE.get(upper) || STATE_BY_NAME.get(upper);

  return match?.code || text;
}


export function isRecognizedBidLogState(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    return true;
  }

  const upper = text.toUpperCase();
  return STATE_BY_CODE.has(upper) || STATE_BY_NAME.has(upper);
}


export default function BidLogStateSelect({
  value,
  disabled = false,
  onChange,
}) {
  const normalized = normalizeBidLogState(value);
  const recognized = isRecognizedBidLogState(value);

  return (
    <select
      value={normalized}
      disabled={disabled}
      autoComplete="address-level1"
      onChange={event => onChange?.(event.target.value)}
    >
      <option value="">—</option>

      {!recognized && normalized && (
        <option value={normalized} disabled>
          {normalized} (current value — not recognized)
        </option>
      )}

      {US_STATES.map(([code, name]) => (
        <option key={code} value={code}>
          {code} — {name}
        </option>
      ))}
    </select>
  );
}
