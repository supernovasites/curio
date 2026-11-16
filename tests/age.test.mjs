import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ageOnDate} from '../campanhas/age.js';
test('age changes on the birthday and handles missing or invalid dates',()=>{
  assert.equal(ageOnDate('1988-11-16','2026-11-16'),38);
  assert.equal(ageOnDate('1988-11-17','2026-11-16'),37);
  assert.equal(ageOnDate('1988-11-15','2026-11-16'),38);
  assert.equal(ageOnDate('2025-11-16','2026-11-16'),1);
  assert.equal(ageOnDate('2026-11-16','2026-11-16'),0);
  for(const date of ['',null,'1988-02-30','2027-01-01','16/11/1988'])assert.equal(ageOnDate(date,'2026-11-16'),null);
  assert.equal(ageOnDate('2000-02-29','2025-02-28'),24);
  assert.equal(ageOnDate('2000-02-29','2025-03-01'),25);
});
test('default age uses the Fortaleza date when UTC is already the next day',t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,10,17,1)});
  assert.equal(ageOnDate('1988-11-17'),37);
});
