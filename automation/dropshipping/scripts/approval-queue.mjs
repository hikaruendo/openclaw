import { mkdir, writeFile } from 'node:fs/promises';

export const writeApprovalQueue = async ({ triage, outFileUrl }) => {
  const manual = triage.decisions.filter((d) => d.decision === 'manual_review');
  const payload = {
    createdAt: new Date().toISOString(),
    count: manual.length,
    items: manual
  };

  await mkdir(new URL('../state/', outFileUrl), { recursive: true });
  await writeFile(outFileUrl, JSON.stringify(payload, null, 2));
  return payload;
};
