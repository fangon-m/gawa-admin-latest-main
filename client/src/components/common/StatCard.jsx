import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

export default function StatCard({ label, value, icon, change, changeLabel, color, className, onClick }) {
  const accentColor = color || 'var(--color-accent)';
  const isPositive = change >= 0;
  return (
    <div
      className={`stat-card${onClick ? ' clickable' : ''}${className ? ' ' + className : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <div className="stat-card-header">
        <div>
          <div className="stat-card-label">{label}</div>
          <div className="stat-card-value">{value}</div>
          {change !== undefined && (
            <div className={`stat-card-change ${isPositive ? 'positive' : 'negative'}`}>
              <span className="stat-card-change-icon">
                {isPositive ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              </span>
              {Math.abs(change)}% {changeLabel || 'vs last month'}
            </div>
          )}
        </div>
        {icon && (
          <div
            className="stat-card-icon"
            style={{ background: `${accentColor}15`, color: accentColor }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
