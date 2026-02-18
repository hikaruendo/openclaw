import { readFile } from 'node:fs/promises';

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq === -1) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
};

const tryLoad = async (url) => {
  try {
    const raw = await readFile(url, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (process.env[parsed.key] == null || process.env[parsed.key] === '') {
        process.env[parsed.key] = parsed.value;
      }
    }
    return true;
  } catch {
    return false;
  }
};

export const loadEnv = async () => {
  // Priority: automation/dropshipping/.env then workspace .env
  await tryLoad(new URL('../.env', import.meta.url));
  await tryLoad(new URL('../../../.env', import.meta.url));
};
