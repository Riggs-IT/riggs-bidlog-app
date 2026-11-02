// Shared by Projected Billings and the read-only table data dumps.
// Retain the existing Excel-friendly UTF-8 BOM, CSV quotes, and CRLF rows.
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);

  // Bid and project names are not trusted spreadsheet formulas. Preserve
  // signed numeric strings, but make formula-like TEXT inert in Excel.
  const safeText = typeof value === 'string'
    && /^[\s]*[=+\-@\t\r\n]/.test(text)
    && !/^[\s]*-?\d+(?:\.\d+)?[\s]*$/.test(text)
      ? `'${text}`
      : text;

  return `"${safeText.replaceAll('"', '""')}"`;
}

export function serializeCsv(headers, rows) {
  return '\uFEFF' + [
    headers.map(csvCell).join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\r\n');
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([serializeCsv(headers, rows)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
