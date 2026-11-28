import { WORK_GROUPS } from '@pechkas/shared/src/work';
import type { Lists } from './lists';

export type Job = Lists['job_types'][number];
export type Group = { title: string; art: string; jobs: Job[] };

/**
 * The trade's groups, in order, each with its jobs; jobs no group names
 * become one more group, "More jobs", so a job added by migration shows the
 * day it is added.
 */
export function sections(jobs: Job[], trade: string): Group[] {
  const used = new Set<number>();
  const out: Group[] = [];
  for (const g of WORK_GROUPS[trade] ?? []) {
    const mine = g.jobs.flatMap((name) => {
      const j = jobs.find((x) => x.name === name);
      if (!j || used.has(j.id)) return [];
      used.add(j.id);
      return [j];
    });
    if (mine.length) out.push({ title: g.title, art: g.art ?? trade, jobs: mine });
  }
  const rest = jobs.filter((j) => !used.has(j.id));
  if (rest.length) out.push({ title: 'More jobs', art: trade, jobs: rest });
  return out;
}

