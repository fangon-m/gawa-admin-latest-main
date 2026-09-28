import React, { useState } from 'react';
import { useSidebarToggle } from '../../context/SidebarContext';
import { Menu, Search } from 'lucide-react';

export default function Header({ title, onSearch }) {
  const toggleSidebar = useSidebarToggle();
  const [searchValue, setSearchValue] = useState('');

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearchValue(val);
    if (onSearch) onSearch(val);
  };

  return (
    <header className="header">
      <div className="header-left">
        {toggleSidebar && (
          <button className="header-mobile-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
            <Menu size={20} />
          </button>
        )}
        <h1 className="header-title">{title || 'Dashboard'}</h1>
        {onSearch && (
          <div className="header-search">
            <span className="header-search-icon"><Search size={15} /></span>
            <input
              type="text"
              placeholder="Search..."
              value={searchValue}
              onChange={handleSearch}
            />
          </div>
        )}
      </div>
    </header>
  );
}
