const CSV_COLUMNS = [
  ['Report ID', 'id'],
  ['Reporter', 'reporterName'],
  ['Reported User', 'reportedName'],
  ['Target Type', 'targetType'],
  ['Target ID', 'targetId'],
  ['Incident Type', 'issueType'],
  ['Comment', 'comment'],
  ['Status', 'status'],
  ['Filed At', 'createdAt'],
  ['Attachments', 'attachmentPaths'],
];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function filterIncidentReports(reports, { startDate, endDate, reportType }) {
  if (!startDate || !endDate || startDate > endDate) return [];

  return reports.filter((report) => {
    const createdAt = new Date(report.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return false;
    const localDate = [
      createdAt.getFullYear(),
      String(createdAt.getMonth() + 1).padStart(2, '0'),
      String(createdAt.getDate()).padStart(2, '0'),
    ].join('-');

    return localDate >= startDate
      && localDate <= endDate
      && (reportType === 'all' || report.issueType === reportType);
  });
}

export function createIncidentReportCsv(reports) {
  const rows = [
    CSV_COLUMNS.map(([label]) => label),
    ...reports.map((report) => CSV_COLUMNS.map(([, key]) => report[key])),
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
