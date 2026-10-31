// The data of the game must pass the standard checks (schemas + cross-file checks + floor plan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const run = (...a) => execFileSync(process.execPath, a, { encoding: 'utf8' });
test('game data passes check-game-data', () => { assert.match(run('tools/check-game-data.mjs', '.'), /0 error/); });
// no-loop is ignored: the village's loop is outdoors (家の前の道 - 村道 - 道端の社 - 田んぼの畦), checked by check-escape; plan-check counts only corridors
test('floor plan passes check-plan --strict', () => { run('tools/check-plan.mjs', 'data/plan.json', '--strict', '--ignore=no-loop'); assert.ok(true); });
