import React, { useState, useMemo } from 'react';
import { Clipboard, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import Pagination from './Pagination';

export default function DataTable({
  columns,
  data,
  onRowClick,
  pageSize = 10,
  sortable = true,
  emptyMessage = 'No records found',
  loading = false,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const handleSort = (key) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const safeData = Array.isArray(data) ? data : [];

  const sorted = useMemo(() => {
    if (!sortKey) return safeData;
    return [...safeData].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [safeData, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  if (loading) {
    return (
      <div className="empty-state" style={{ padding: '2rem' }}>
        <div className="empty-state-text">Loading...</div>
      </div>
    );
  }

  if (safeData.length === 0) {
    return (
      <div className="data-table-empty">
        <div className="data-table-empty-icon"><Clipboard size={36} /></div>
        <div className="data-table-empty-text">{emptyMessage}</div>
      </div>
    );
  }

  const sortIcon = (key) => {
    if (sortKey !== key) return <ArrowUpDown size={13} />;
    return sortDir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  return (
    <div>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={sortable ? 'sortable' : ''}
                  onClick={() => handleSort(col.key)}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                  {sortable && <span className={`sort-indicator${sortKey === col.key ? ' sorted-asc' : ''}`}>{sortIcon(col.key)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, idx) => (
              <tr
                key={row.id || idx}
                className={onRowClick ? 'clickable' : ''}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={sorted.length}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
