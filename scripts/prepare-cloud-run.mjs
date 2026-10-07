import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const reportRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../Growth/operations');
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Missing GitHub repository context.');
if (!process.env.GH_TOKEN || !process.env.GITHUB_OUTPUT) throw new Error('Missing workflow access or output context.');
await mkdir(reportRoot, { recursive: true });

async function api(path) {
  const response = await fetch('https://api.github.com/repos/' + repository + path, {
    headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('GitHub state lookup failed: ' + response.status);
  return response.json();
}

const history = await api('/actions/workflows/ecosystem-maintenance.yml/runs?status=completed&per_page=20');
for (const run of history.workflow_runs) {
  if (String(run.id) === process.env.GITHUB_RUN_ID || run.head_branch !== 'main') continue;
  const available = await api('/actions/runs/' + run.id + '/artifacts?per_page=20');
  if (!available.artifacts.some(item => item.name === 'ecosystem-maintenance-state' && !item.expired)) continue;
  await execute('gh', ['run', 'download', String(run.id), '--repo', repository, '--name', 'ecosystem-maintenance-state', '--dir', reportRoot]);
  console.log('Restored source snapshots and reference cursor from run ' + run.id + '.');
  break;
}

let report;
try { report = JSON.parse(await readFile(resolve(reportRoot, 'latest.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const singapore = date => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { day: values.year + '-' + values.month + '-' + values.day, hour: Number(values.hour) };
};
const now = singapore(new Date());
const previous = report ? singapore(new Date(report.checked_at)) : null;
const alreadyCompleted = previous?.day === now.day && previous.hour >= 10 && report.health?.length > 0 && report.health.every(item => item.passed === true) && report.discovery?.providers?.length > 0 && report.discovery.providers.every(item => item.outcome === 'ok');
const skip = process.env.GITHUB_EVENT_NAME === 'schedule' && alreadyCompleted;
await appendFile(process.env.GITHUB_OUTPUT, 'skip_daily=' + skip + '\n');
if (skip) {
  const message = 'Today’s cloud check already passed after 10:00 Singapore time. Fallback skipped; no duplicate collection.\n';
  console.log(message);
  await appendFile(process.env.GITHUB_STEP_SUMMARY, message);
} else {
  console.log('Cloud collection will run. Public reports only; no organization data or website content writes.');
}
