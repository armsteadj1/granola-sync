#!/usr/bin/env node
// Adds shebang line and makes dist/index.js executable after tsc build
const fs = require('fs');
const file = 'dist/index.js';
let content = fs.readFileSync(file, 'utf-8');
if (!content.startsWith('#!/usr/bin/env node')) {
  fs.writeFileSync(file, '#!/usr/bin/env node\n' + content);
}
fs.chmodSync(file, '755');
