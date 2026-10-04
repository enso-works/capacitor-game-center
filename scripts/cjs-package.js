// Marks dist/cjs as CommonJS, as the package itself is "type": "module".
import { writeFileSync } from 'node:fs';

writeFileSync('dist/cjs/package.json', `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
