import React from 'react';

export default function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key || tab}
          className={`tab${activeTab === (tab.key || tab) ? ' active' : ''}`}
          onClick={() => onChange(tab.key || tab)}
        >
          {tab.label || tab}
        </button>
      ))}
    </div>
  );
}
