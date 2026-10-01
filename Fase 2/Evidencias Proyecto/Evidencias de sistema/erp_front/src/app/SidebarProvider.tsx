import { useEffect, useState, type ReactNode } from 'react';
import { SidebarContext } from './sidebar-context';

const STORAGE_KEY = 'almahue-erp-sidebar-collapsed';

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const setCollapsed = (value: boolean) => setCollapsedState(value);
  const toggleCollapsed = () => setCollapsedState((c) => !c);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}
