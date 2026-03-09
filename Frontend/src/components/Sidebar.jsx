import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  Search,
  RefreshCcw,
  Sparkles,
  FileText,
  History,
  Bell,
  User,
  Settings,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Warehouse,
  X,
  Shield
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';

const Sidebar = ({ activeItem, setActiveItem, isMobileOpen, isCollapsed, onClose, onToggleCollapse }) => {
  const { user, isAdmin, hasPermission } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread notification count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await api.getUnreadCount();
        setUnreadCount(response.count || 0);
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };

    fetchUnreadCount();

    // Refresh count every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);

    return () => clearInterval(interval);
  }, []);

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', live: true },
    { icon: Package, label: 'Inventory Overview', live: true },
    { icon: Sparkles, label: 'Supplier Risk Radar', live: true },
  ];

  const logisticsItems = [
    { icon: Warehouse, label: 'Depots', live: true },
    { icon: RefreshCcw, label: 'Movement & Transactions', live: true },
    { icon: Search, label: 'Stock Search & Tracking', live: true },
  ];

  const otherItems = [
    ...(hasPermission('reports:export') ? [{ icon: FileText, label: 'Reports Export' }] : []),
    { icon: Bell, label: 'Notifications', badge: unreadCount },
  ];

  const accountItems = [
    ...(isAdmin() ? [{ icon: Shield, label: 'Admin Panel', live: true }] : []),
    { icon: User, label: 'Account' },
    { icon: Settings, label: 'System Settings' },
    { icon: MessageSquare, label: 'Feedback' },
  ];

  // Human-readable role labels for footer display
  const ROLE_LABELS = { admin: 'Super Admin', manager: 'Manager', staff: 'Staff', viewer: 'Viewer (Read-Only)' };

  const handleNavClick = (label) => {
    setActiveItem(label);
    // Close sidebar on mobile when item is clicked
    if (onClose && window.innerWidth <= 768) {
      onClose();
    }
  };

  return (
    <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon shadow-sm">D</div>
          {!isCollapsed && (
            <div className="logo-text">
              <h4>Depot Manager</h4>
              <span>Logistics Control System</span>
            </div>
          )}
        </div>
        <button className="mobile-close-btn" onClick={onClose}>
          <X size={16} />
        </button>
        <button className="collapse-btn" onClick={onToggleCollapse}>
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          {!isCollapsed && <p className="section-title">MAIN MENU</p>}
          {menuItems.map((item, i) => (
            <button
              key={i}
              className={`nav-item ${activeItem === item.label ? 'active' : ''}`}
              onClick={() => handleNavClick(item.label)}
            >
              <item.icon size={20} className={activeItem === item.label ? 'pulse' : ''} />
              {!isCollapsed && <span>{item.label}</span>}
              {!isCollapsed && item.live && <span className="live-pill">LIVE</span>}
              {activeItem === item.label && <div className="active-indicator" />}
            </button>
          ))}
        </div>

        <div className="nav-section">
          {!isCollapsed && <p className="section-title">LOGISTICS NETWORK</p>}
          {logisticsItems.map((item, i) => (
            <button
              key={i}
              className={`nav-item ${activeItem === item.label ? 'active' : ''}`}
              onClick={() => handleNavClick(item.label)}
            >
              <item.icon size={20} />
              {!isCollapsed && <span>{item.label}</span>}
              {!isCollapsed && item.live && <span className="live-pill">LIVE</span>}
              {activeItem === item.label && <div className="active-indicator" />}
            </button>
          ))}
        </div>

        <div className="nav-section">
          {!isCollapsed && <p className="section-title">SYSTEM</p>}
          {otherItems.map((item, i) => (
            <button
              key={i}
              className={`nav-item ${activeItem === item.label ? 'active' : ''}`}
              onClick={() => handleNavClick(item.label)}
            >
              <item.icon size={20} />
              {!isCollapsed && <span>{item.label}</span>}
              {!isCollapsed && item.badge && <span className="badge">{item.badge}</span>}
              {activeItem === item.label && <div className="active-indicator" />}
            </button>
          ))}
        </div>

        <div className="nav-section">
          {!isCollapsed && <p className="section-title">SYSTEM CONTROL</p>}
          {accountItems.map((item, i) => (
            <button
              key={i}
              className={`nav-item ${activeItem === item.label ? 'active' : ''}`}
              onClick={() => handleNavClick(item.label)}
            >
              <item.icon size={20} />
              {!isCollapsed && <span>{item.label}</span>}
              {activeItem === item.label && <div className="active-indicator" />}
            </button>
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-sm glass-effect">
          <div className="user-avatar shadow-md">
            {user?.name?.charAt(0) || user?.first_name?.charAt(0) || 'U'}
          </div>
          {!isCollapsed && (
            <div className="user-info">
              <strong>
                {user?.name || user?.first_name || user?.firstName || user?.email?.split('@')[0] || 'User'}
              </strong>
              <span>{ROLE_LABELS[user?.role] || 'Staff'}</span>
            </div>
          )}
          {!isCollapsed && <Settings size={16} className="settings-icon spin-on-hover" />}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
