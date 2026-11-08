// Synthetic sample files for the demo documents. They're generated in code (no
// binary fixtures) so the demo reset can restore them on Vercel, and
// scripts/seed-storage.ts can upload them locally.
// Keep this module free of imports so Node can run it directly.

/** Builds a minimal, valid single-page PDF with one line of text per entry. */
export function makePdf(lines: string[]): string {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 22} Td (${esc(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

export type SeedFile = { path: string; mime: string; content: string };

export const SEED_FILES: SeedFile[] = [
  {
    path: "a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000301",
    mime: "application/pdf",
    content: makePdf([
      "Northwind Bakery - Website redesign brief",
      "Goal: a fast brochure site that drives catering enquiries.",
      "Pages: Home, Menu, Catering, Locations, About, Contact.",
      "Must have: editable menu, enquiry form, Google Business sync.",
      "Out of scope: online payments (see Online ordering launch).",
      "Sample document for the Client Portal Mini demo.",
    ]),
  },
  {
    path: "a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000302",
    mime: "text/plain",
    content: [
      "Northwind Bakery - Sitemap v2",
      "",
      "/            Home: hero, today's specials, catering CTA",
      "/menu        Breads, pastries, cakes (editable by staff)",
      "/catering    Packages + enquiry form -> orders@ and owner",
      "/locations   Two stores, hours, map links",
      "/about       Story, team, suppliers",
      "/contact     Phone, email, social links",
      "",
      "Sample document for the Client Portal Mini demo.",
      "",
    ].join("\n"),
  },
  {
    path: "a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000303",
    mime: "text/csv",
    content: [
      "phase,hours,rate_aud,subtotal_aud",
      "Discovery,6,150,900",
      "Design,18,150,2700",
      "Build,32,150,4800",
      "Content and launch,10,150,1500",
      "",
    ].join("\n"),
  },
  {
    path: "b0000000-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-000000000401",
    mime: "application/pdf",
    content: makePdf([
      "Harbour Physio - Online booking rules",
      "Initial consults: 45 minutes. Follow-ups: 30 minutes.",
      "Cancellations within 24 hours incur the clinic fee.",
      "SMS reminders: 48 hours and 2 hours before each booking.",
      "New patients must complete the intake form before booking.",
      "Sample document for the Client Portal Mini demo.",
    ]),
  },
];

export const byteLength = (s: string) => new TextEncoder().encode(s).length;
