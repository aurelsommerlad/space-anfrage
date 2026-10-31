import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  daysInclusive,
  eachDay,
  formatRange,
  isIsoDate,
  monthGrid,
  todayInVenue,
  venueDateTimeToIso,
} from "../src/lib/dates.ts";

test("todayInVenue nutzt Europe/Berlin", () => {
  // 31.10.2026 23:30 UTC ist in Berlin bereits der 1.11. (00:30 MEZ)
  assert.equal(todayInVenue(new Date("2026-10-31T23:30:00Z")), "2026-11-01");
  // 28.03.2027 22:30 UTC ist in Berlin 00:30 MESZ am 29.03.
  assert.equal(todayInVenue(new Date("2027-03-28T22:30:00Z")), "2027-03-29");
  assert.equal(todayInVenue(new Date("2026-06-15T21:59:00Z")), "2026-06-15");
  assert.equal(todayInVenue(new Date("2026-06-15T22:00:00Z")), "2026-06-16");
});

test("Tagesarithmetik über Zeitumstellung und Monatsgrenzen", () => {
  assert.equal(addDays("2026-10-24", 1), "2026-10-25");
  assert.equal(addDays("2026-10-25", 1), "2026-10-26");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(daysInclusive("2026-10-30", "2026-11-02"), 4);
  assert.deepEqual(eachDay("2026-10-30", "2026-11-01"), ["2026-10-30", "2026-10-31", "2026-11-01"]);
});

test("Validierung von Datumswerten", () => {
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("26-1-1"), false);
});

test("Monatsraster beginnt am Montag", () => {
  const grid = monthGrid("2026-11"); // 1.11.2026 ist ein Sonntag
  assert.deepEqual(grid[0], [null, null, null, null, null, null, "2026-11-01"]);
  assert.equal(grid.at(-1)?.at(0), "2026-11-30");
});

test("Zeitstempel mit Berliner Offset", () => {
  assert.equal(venueDateTimeToIso("2026-11-05", "09:00"), "2026-11-05T09:00:00+01:00");
  assert.equal(venueDateTimeToIso("2026-07-05", "18:30"), "2026-07-05T18:30:00+02:00");
  assert.equal(venueDateTimeToIso("2026-11-05", "24:00"), "2026-11-06T00:00:00+01:00");
});

test("Zeitraum-Formatierung", () => {
  assert.equal(formatRange("2026-11-05", "2026-11-07"), "5.–7. Nov. 2026");
  assert.equal(formatRange("2026-10-30", "2026-11-02"), "30. Okt. – 2. Nov. 2026");
});
