/**
 * The design rules live twice: docs/DESIGN.md for people, and
 * .claude/skills/pechkas-design/SKILL.md for Claude. The skill is the same
 * text under a short header, so the two can never say different things.
 * This fails if they drift. To fix: copy docs/DESIGN.md under the header.
 */
import { readFileSync } from 'node:fs';

const design = readFileSync(new URL('../docs/DESIGN.md', import.meta.url), 'utf8');
const skill = readFileSync(new URL('../.claude/skills/pechkas-design/SKILL.md', import.meta.url), 'utf8');

const header = skill.match(/^---\n[\s\S]*?\n---\n\n/);
if (!header) {
  console.error('✗ SKILL.md must start with its --- name/description --- header.');
  process.exit(1);
}
if (!/\nname: pechkas-design\n/.test(header[0]) || !/\ndescription: .{40,}/.test(header[0])) {
  console.error('✗ SKILL.md header needs name: pechkas-design and a description.');
  process.exit(1);
}
if (skill.slice(header[0].length) !== design) {
  console.error('✗ .claude/skills/pechkas-design/SKILL.md no longer matches docs/DESIGN.md.');
  console.error('  Copy docs/DESIGN.md under the skill header so both say the same.');
  process.exit(1);
}
console.log('✓ The design skill matches docs/DESIGN.md.');
