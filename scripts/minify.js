const { minify } = require('terser');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

function minifyFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');

  return minify(code, {
    compress: {
      drop_console: true,  // Remove console.* calls
      drop_debugger: true,
      pure_funcs: ['console.log', 'console.warn', 'console.error', 'console.info', 'console.trace']
    },
    mangle: false,  // Don't mangle names to keep debugging easier
    format: {
      comments: false
    }
  });
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (file.endsWith('.js')) {
      console.log(`Minifying ${filePath}...`);
      minifyFile(filePath).then(result => {
        if (result.code) {
          fs.writeFileSync(filePath, result.code, 'utf8');
          console.log(`  ✓ Minified ${filePath}`);
        }
      }).catch(err => {
        console.error(`  ✗ Error minifying ${filePath}:`, err.message);
      });
    }
  }
}

console.log('Starting production minification...');
processDirectory(distDir);
console.log('Minification complete!');
