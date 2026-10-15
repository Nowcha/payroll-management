// Fails when personal data (PDFs, private/, exports) is tracked by git.
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
const offending = tracked.filter(
  (f) =>
    /\.pdf$/i.test(f) ||
    f.startsWith('private/') ||
    f.startsWith('inbox/') ||
    /\.export\.json$/i.test(f),
);
if (offending.length > 0) {
  console.error('Personal data is tracked by git:\n' + offending.join('\n'));
  process.exit(1);
}
console.log('check:private OK (' + tracked.filter(Boolean).length + ' tracked files)');
