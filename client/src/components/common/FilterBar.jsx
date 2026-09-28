import React from 'react';

export default function FilterBar({ filters, values, onChange }) {
  return (
    <div className="filter-bar">
      {filters.map((f) => (
        <select
          key={f.key}
          value={values[f.key] || ''}
          onChange={(e) => onChange(f.key, e.target.value)}
        >
          <option value="">{f.placeholder || `All ${f.label}`}</option>
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
    </div>
  );
}
