import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePermissions } from '../../utils/permissions';
import { getInitials } from '../../utils/helpers';
import { House, Users, UserRoundCheck, Briefcase, ToolCaseIcon, Building2, ArrowLeftRightIcon, CoinsIcon, ShieldAlertIcon, Mail, CogIcon, ChevronLeft, ChevronRight, Bell, LogOut, Landmark, AlertTriangle, ClipboardList } from 'lucide-react';
import NotificationPanel from '../common/NotificationPanel';

const navItems = [
  { section: 'Main' },
  { label: 'Dashboard', path: '/', icon: House, permission: 'viewDashboard' },
  { label: 'Users', path: '/users', icon: Users, permission: 'viewUsers' },
  { label: 'Verifications', path: '/verifications', icon: UserRoundCheck, permission: 'viewVerifications' },
  { section: 'Content' },
  { label: 'Jobs', path: '/jobs', icon: Briefcase, permission: 'viewJobs' },
  { label: 'Listings', path: '/listings', icon: ToolCaseIcon, permission: 'viewListings' },
  { label: 'Rentals', path: '/rentals', icon: Building2, permission: 'viewRentals' },
  { section: 'Finance' },
  { label: 'Transactions', path: '/transactions', icon: ArrowLeftRightIcon, permission: 'viewTransactions' },
  { label: 'Gawa Points', path: '/gawa-points', icon: CoinsIcon, permission: 'viewGawaPoints' },
  { label: 'Trust Ledger', path: '/trust-ledger', icon: Landmark, permission: 'viewTransactions' },
  { section: 'Oversight' },
  { label: 'Oversight', path: '/oversight', icon: ShieldAlertIcon, permission: 'viewDisputes' },
  { section: 'Communication' },
  { label: 'Messages', path: '/messages', icon: Mail, permission: 'viewMessages' },
  { section: 'System' },
  { label: 'Settings', path: '/settings', icon: CogIcon, permission: 'viewSettings' },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { user, logout } = useAuth();
  const { can, isSupport } = usePermissions(user);
  const { unreadCount } = useNotifications();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
    };
    if (showProfile) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProfile]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  const filteredItems = navItems.filter((item) => {
    if (!item.permission) return true;
    if (isSupport && item.path === '/settings') return true;
    return can(item.permission);
  });

  const handleNavClick = () => {
    if (onMobileClose) onMobileClose();
  };

  const sidebarClass = [
    'sidebar',
    collapsed ? 'collapsed' : '',
    mobileOpen ? 'open' : '',
  ].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClass}>
      <div className="sidebar-logo">
        <img src="/logo.svg" alt="GAWA" className="sidebar-logo-mark" />
        {!collapsed && (
          <div className="sidebar-logo-text">GAWA</div>
        )}
      </div>
      <nav className="sidebar-nav">
        {filteredItems.map((item, idx) => {
          if (item.section) {
            return <div key={idx} className={collapsed ? 'sidebar-section-divider' : 'sidebar-section'}>{collapsed ? '' : item.section}</div>;
          }
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' active' : ''}`
              }
              title={collapsed && !mobileOpen ? item.label : undefined}
              onClick={handleNavClick}
            >
              <span className="sidebar-link-icon"><Icon size={18} /></span>
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-divider" />

      <div className="sidebar-bottom">
        <div ref={notifRef} className="sidebar-notif-wrapper">
          <button
            className="sidebar-bottom-btn"
            title="Notifications"
            onClick={() => setShowNotifications((prev) => !prev)}
          >
            <span className="sidebar-link-icon"><Bell size={16} /></span>
            {(!collapsed || mobileOpen) && <span>Notifications</span>}
            {unreadCount > 0 && <span key={unreadCount} className="sidebar-link-badge sidebar-link-badge-animated">{unreadCount}</span>}
          </button>
          {showNotifications && (
            <div className="sidebar-notif-dropdown">
              <NotificationPanel onClose={() => setShowNotifications(false)} />
            </div>
          )}
        </div>

        <div ref={profileRef} className="sidebar-profile-wrapper">
          <button
            className="sidebar-profile-btn"
            onClick={() => setShowProfile(!showProfile)}
          >
            <div className="sidebar-profile-avatar">
              {getInitials(user?.name)}
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="sidebar-profile-info">
                <div className="sidebar-profile-name">{user?.name}</div>
                <div className="sidebar-profile-role">{user?.role === 'admin' ? 'Admin' : 'Support'}</div>
              </div>
            )}
          </button>

          {showProfile && (
            <div className="sidebar-dropdown">
              <div className="sidebar-dropdown-header">{user?.email}</div>
              <hr />
              <button className="sidebar-dropdown-item sidebar-dropdown-item-danger" onClick={() => { setShowProfile(false); logout(); }}>
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-collapse-btn" onClick={onToggle}>
          <span className="sidebar-link-icon">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </span>
          {(!collapsed || mobileOpen) && <span>Collapse</span>}
        </div>
      </div>
    </aside>
  );
}
