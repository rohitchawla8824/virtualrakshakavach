function escapePdf(text: string) {
  return text.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
}
export function textPdf(lines: string[]) {
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 48)) }, (_, index) =>
    lines.slice(index * 48, (index + 1) * 48),
  );
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let index = 0; index < pages.length; index++) {
    const commands = [
      'BT',
      '/F1 11 Tf',
      '50 790 Td',
      '15 TL',
      ...pages[index].flatMap((line, lineIndex) =>
        lineIndex ? [`T* (${escapePdf(line)}) Tj`] : [`(${escapePdf(line)}) Tj`],
      ),
      'ET',
    ].join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    );
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}
