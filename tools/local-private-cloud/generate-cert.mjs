import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';

function parseArg(name) {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1) return '';
  return process.argv[idx + 1] || '';
}

function isIPv4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (part === '' || !/^\d+$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

const lanIp = parseArg('--lan-ip');
const outDir = parseArg('--out-dir') || path.join(process.cwd(), '.cert');

if (!isIPv4(lanIp)) {
  console.error('Invalid or missing --lan-ip (expected IPv4).');
  process.exit(1);
}

const attrs = [
  { name: 'commonName', value: lanIp },
  { name: 'organizationName', value: 'Nexus Bridge Local' },
];

const altNames = [
  { type: 2, value: 'localhost' },
  { type: 2, value: 'nexusbridge.local' },
  { type: 7, ip: '127.0.0.1' },
  { type: 7, ip: lanIp },
];

const pems = selfsigned.generate(attrs, {
  keySize: 2048,
  days: 825,
  algorithm: 'sha256',
  extensions: [
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
    },
    { name: 'subjectAltName', altNames },
  ],
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'domain.key'), pems.private, 'utf8');
fs.writeFileSync(path.join(outDir, 'domain.crt'), pems.cert, 'utf8');

console.log(`Generated certificate for ${lanIp}`);
console.log(`Output directory: ${outDir}`);
