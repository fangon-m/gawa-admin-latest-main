import { describe, expect, it } from 'vitest';
import { createIncidentReportCsv, filterIncidentReports } from './incidentReportExport';

describe('incident report export', () => {
  it('filters reports by the selected date range and type', () => {
    const reports = [
      { issueType: 'spam', createdAt: '2026-01-01T12:00:00.000Z' },
      { issueType: 'harassment', createdAt: '2026-01-15T12:00:00.000Z' },
      { issueType: 'spam', createdAt: '2026-02-01T00:00:00.000Z' },
    ];

    expect(filterIncidentReports(reports, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      reportType: 'spam',
    })).toEqual([reports[0]]);
  });

  it('includes the complete selected calendar days and rejects a reversed range', () => {
    const firstDay = new Date(2026, 0, 1, 0, 0, 0).toISOString();
    const lastDay = new Date(2026, 0, 31, 23, 59, 59, 999).toISOString();
    const nextDay = new Date(2026, 1, 1, 0, 0, 0).toISOString();
    const reports = [
      { issueType: 'spam', createdAt: firstDay },
      { issueType: 'spam', createdAt: lastDay },
      { issueType: 'spam', createdAt: nextDay },
    ];

    expect(filterIncidentReports(reports, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      reportType: 'all',
    })).toEqual(reports.slice(0, 2));
    expect(filterIncidentReports(reports, {
      startDate: '2026-01-31',
      endDate: '2026-01-01',
      reportType: 'all',
    })).toEqual([]);
  });

  it('quotes CSV values and neutralizes spreadsheet formulas', () => {
    const csv = createIncidentReportCsv([{
      id: 'rep-1',
      reporterName: 'Alex "A"',
      targetId: '=HYPERLINK("https://example.test")',
      issueType: 'spam',
      comment: 'Example, with comma',
    }]);

    expect(csv).toContain('"Alex ""A"""');
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.test\"\")\"");
    expect(csv).toContain('"Example, with comma"');
  });
});
