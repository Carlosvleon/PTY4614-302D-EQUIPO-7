import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calendarDateFromInput, formatCalendarDate, localIsoDate } from './calendar-date.ts';

describe('fecha calendario (Sergio 03/09 [08:22] [08:56])', () => {
  it('no atrasa un día un YYYY-MM-DD', () => {
    const d = calendarDateFromInput('2026-06-03');
    assert.ok(d);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 5);
    assert.equal(d.getDate(), 3);
    assert.equal(formatCalendarDate('2026-06-03'), '03-06-2026');
    assert.equal(formatCalendarDate('2026-06-03T00:00:00.000Z'), '03-06-2026');
  });

  it('rechaza fechas imposibles', () => {
    assert.equal(formatCalendarDate('2026-13-40'), '—');
    assert.equal(calendarDateFromInput('no-es-fecha'), null);
  });

  it('localIsoDate usa el día local, no UTC', () => {
    const d = new Date(2026, 5, 3, 22, 0, 0);
    assert.equal(localIsoDate(d), '2026-06-03');
  });
});
