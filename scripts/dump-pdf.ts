// Local-only: prints positioned text of a PDF for layout analysis. Output contains personal data.
import { readPdfText } from './lib/node-pdf';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('usage: tsx scripts/dump-pdf.ts <file.pdf>');
  for (const page of await readPdfText(file)) {
    console.log(`# page ${page.pageNumber} (${page.width}x${page.height})`);
    const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
    for (const i of sorted) {
      console.log(`${i.y.toFixed(1)}\t${i.x.toFixed(1)}\t${(i.x + i.width).toFixed(1)}\t${i.str}`);
    }
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
