function pdfText(value) {
  return String(value).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/[\\()]/g, '\\$&');
}

const paymentLabels = {
  pendiente: 'Pendiente', cobrada: 'Cobrado', anulada: 'Anulado', historica: 'Histórico',
  reembolso_pendiente: 'Reembolso pendiente', reembolsada: 'Reembolsado',
};

export function historyPdf({ from, to, rows, summary }) {
  const pages = Math.max(1, Math.ceil(rows.length / 30));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${5 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  for (let index = 0; index < pages; index++) {
    const content = [];
    function print(value, x, y, size = 9, font = 'F1', color = '0.09 0.22 0.18') {
      content.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`);
    }
    content.push('0.075 0.21 0.17 rg 0 722 595 120 re f');
    print('PARADISE RESORT  /  VIACHA', 36, 802, 10, 'F2', '0.93 0.79 0.55');
    print('Historial de operaciones', 36, 768, 26, 'F2', '1 1 1');
    print(`Fecha de entrada o actividad: ${from} a ${to}`, 36, 741, 10, 'F1', '1 1 1');
    print(`Reservas: ${summary.count}   Confirmadas: ${summary.confirmed}   Canceladas: ${summary.cancelled}`, 36, 696, 10, 'F2');
    print(`Cobrado: Bs ${summary.received}   Pendiente: Bs ${summary.pending}   Reembolsado: Bs ${summary.refunded}`, 36, 678, 10);
    print(`Reembolso pendiente: Bs ${summary.pendingRefund}   Neto registrado: Bs ${summary.received - summary.refunded}`, 36, 662);
    const cols = [36, 108, 189, 335, 414, 513];
    content.push('0.90 0.92 0.89 rg 30 624 535 24 re f');
    ['Código', 'Fecha', 'Alojamiento o actividad', 'Reserva', 'Pago', 'Total Bs'].forEach((label, i) => print(label, cols[i], 632, 9, 'F2'));
    if (!rows.length) print('Sin operaciones en el periodo.', 36, 607, 10);
    for (const [i, row] of rows.slice(index * 30, index * 30 + 30).entries()) {
      const y = 607 - i * 18;
      if (i % 2 === 1) content.push(`0.965 0.967 0.944 rg 30 ${y - 6} 535 18 re f`);
      const values = [row.code, row.day, row.item.slice(0, 31), row.booking_status, paymentLabels[row.status], row.amount];
      values.forEach((value, j) => print(value, cols[j], y, 8.5));
    }
    print('Importes registrados por el personal. Los pagos históricos sin verificar no se incluyen en los cobros.', 36, 47, 8);
    print(`Página ${index + 1} de ${pages}`, 36, 30, 8, 'F2');
    const stream = content.join('\n') + '\n';
    const streamId = 6 + 2 * index;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`,
    );
  }
  let result = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(result.length);
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = result.length;
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result, 'latin1');
}
