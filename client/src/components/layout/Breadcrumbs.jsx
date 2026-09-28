import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const pageNames = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/verifications': 'Verifications',
  '/jobs': 'Jobs',
  '/listings': 'Listings',
  '/transactions': 'Transactions',
  '/oversight': 'Oversight',
  '/galaw-points': 'Galaw Points',
  '/messages': 'Messages',
  '/settings': 'Settings',
  '/support': 'Support Dashboard',
};

const detailLabels = {
  '/users': 'User Detail',
  '/jobs': 'Job Detail',
  '/listings': 'Listing Detail',
  '/transactions': 'Transaction Detail',
  '/rentals': 'Rental Detail',
  '/disputes': 'Dispute Detail',
  '/appeals': 'Appeal Detail',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Breadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);

  const crumbs = [{ label: 'Home', path: '/' }];

  let current = '';
  for (const part of parts) {
    current += '/' + part;
    let label;
    if (pageNames[current]) {
      label = pageNames[current];
    } else if (UUID_RE.test(part)) {
      label = detailLabels[current.slice(0, current.lastIndexOf('/'))] || 'Detail';
    } else {
      label = part.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }
    crumbs.push({ label, path: current });
  }

  if (crumbs.length <= 1) return null;

  return (
    <div className="breadcrumbs">
      {crumbs.map((crumb, idx) => (
        <React.Fragment key={crumb.path}>
          {idx > 0 && <span className="breadcrumb-sep">/</span>}
          {idx < crumbs.length - 1 ? (
            <Link to={crumb.path}>{crumb.label}</Link>
          ) : (
            <span>{crumb.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
