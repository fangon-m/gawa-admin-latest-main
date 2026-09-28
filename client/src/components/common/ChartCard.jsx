import React from 'react';

export default function ChartCard({ title, children, className }) {
  return (
    <div className={`chart-card ${className || ''}`}>
      {title && <div className="chart-card-title">{title}</div>}
      {children}
    </div>
  );
}
