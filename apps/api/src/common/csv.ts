/** Lets Excel open UTF-8 (₹, Hindi, accents) correctly. */
export const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** CSV cell: quoted, and text that a spreadsheet would run as a formula is neutralised. */
export function csvCell(value: string | null, { freeText = true } = {}): string {
  let text = value ?? "";
  if (freeText && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A whole CSV file: BOM, header row, CRLF line endings. Rows are already-quoted cells. */
export function csvDocument(header: string[], rows: string[][]): string {
  const lines = [header.map((name) => csvCell(name, { freeText: false })), ...rows].map((cells) =>
    cells.join(","),
  );
  return `${BYTE_ORDER_MARK}${lines.join("\r\n")}\r\n`;
}
