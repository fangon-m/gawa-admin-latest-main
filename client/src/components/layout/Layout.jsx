import React, { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs';
import { SidebarProvider } from '../../context/SidebarContext';

export default function Layout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const val = localStorage.getItem('gawa_sidebar_collapsed');
      return val === null ? true : val !== 'false';
    } catch {
      return true;
    }
  });

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((p) => {
      const next = !p;
      localStorage.setItem('gawa_sidebar_collapsed', next);
      return next;
    });
  };

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((p) => !p);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const layoutClass = [
    'app-layout',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
    mobileSidebarOpen ? 'mobile-sidebar-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={layoutClass}>
      {mobileSidebarOpen && <div className="sidebar-overlay" onClick={closeMobileSidebar} />}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={closeMobileSidebar}
      />
      <div className="main-content">
        <SidebarProvider onToggleSidebar={toggleMobileSidebar}>
          <div className="page-wrapper">
            <Breadcrumbs />
            {children}
          </div>
        </SidebarProvider>
      </div>
    </div>
  );
}
