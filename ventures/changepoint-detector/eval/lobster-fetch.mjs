// Fetch LOBSTER's free sample message files (lobsterdata.com; Nasdaq, 2012-06-21, AAPL, AMZN, GOOG, INTC,
// MSFT) from the public mirror github.com/26Madhav/LOB_dynamics, for eval/stale-growth-lobster.mjs. The data
// is not committed. Needs git. usage: node eval/lobster-fetch.mjs <dir>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { STOCKS } from './stale-growth-lobster.mjs';

const dir = process.argv[2] || 'lobster-data';
const repo = join(dir, 'LOB_dynamics');
mkdirSync(dir, { recursive: true });
const paths = STOCKS.map((s) => `data/LOBSTER_SampleFile_${s}_2012-06-21_5/${s}_2012-06-21_34200000_57600000_message_5.csv`);
if (!existsSync(repo)) execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', 'https://github.com/26Madhav/LOB_dynamics', repo], { stdio: 'inherit' });
execFileSync('git', ['-C', repo, 'checkout', '-q', 'HEAD', '--', ...paths], { stdio: 'inherit' });
for (const p of paths) copyFileSync(join(repo, p), join(dir, p.split('/').at(-1)));
console.log(`${paths.length} message files in ${dir}`);
