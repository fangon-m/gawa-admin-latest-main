import React, { createContext, useContext } from 'react';

const SidebarContext = createContext(null);

export function SidebarProvider({ onToggleSidebar, children }) {
  return (
    <SidebarContext.Provider value={onToggleSidebar}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarToggle() {
  return useContext(SidebarContext);
}
