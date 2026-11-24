import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findJobs } from '../src/work.ts';

const JOBS = [
  { trade: 'plumber', name: 'Geyser installation' },
  { trade: 'plumber', name: 'Geyser repair' },
  { trade: 'plumber', name: 'Leaking tap repair or replacement' },
  { trade: 'electrician', name: 'Ceiling fan installation' },
  { trade: 'electrician', name: 'Exhaust fan fitting' },
  { trade: 'appliances', name: 'Fridge or freezer repair' },
  { trade: 'appliances', name: 'Washing machine repair' },
];
const NAMES: Record<string, string> = { plumber: 'Plumber', electrician: 'Electrician', appliances: 'Home appliances' };
const find = (q: string) => findJobs(q, JOBS, (s) => NAMES[s] ?? s).map((j) => j.name);

test('a word finds the jobs that start with it, in any trade', () => {
  assert.deepEqual(find('geyser'), ['Geyser installation', 'Geyser repair']);
  assert.deepEqual(find('gey'), ['Geyser installation', 'Geyser repair']);
  assert.deepEqual(find('fan'), ['Ceiling fan installation', 'Exhaust fan fitting']);
});

test('a job named for the word is found, and not the rest of its trade', () => {
  assert.deepEqual(find('fridge'), ['Fridge or freezer repair']);
  assert.deepEqual(find('geyser').length, 2, 'not every plumber job, although the plumber covers geysers');
});

test('with no job named for it, the trade and what it covers are searched', () => {
  assert.deepEqual(find('plumber'), ['Geyser installation', 'Geyser repair', 'Leaking tap repair or replacement']);
  assert.deepEqual(find('microwave'), ['Fridge or freezer repair', 'Washing machine repair'], 'Home appliances covers microwaves');
});

test('every word must match, and small words match nothing', () => {
  assert.deepEqual(find('geyser repair'), ['Geyser repair']);
  assert.deepEqual(find('an'), []);
  assert.deepEqual(find('   '), []);
  assert.deepEqual(find('xyzzy'), []);
});
