import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { SupplierRiskProvider } from './context/SupplierRiskContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import InventoryOverview from './pages/InventoryOverview';
import ProductDetailsView from './pages/ProductDetailsView';
import Depots from './pages/Depots';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import SupplierRiskRadar from './pages/SupplierRiskRadar';
import Reports from './pages/Reports';
import MovementTransactions from './pages/MovementTransactions';
import StockSearchTracking from './pages/StockSearchTracking';
import Notifications from './pages/Notifications';
import AdminPanel from './pages/AdminPanel';
import Chatbot from './pages/Chatbot';
import DepotMap from './pages/DepotMap';

function AppLayout({ children }) {
  const { activeItem, setActiveItem } = useNavigation();
  const [theme, setTheme] = useState('light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Close sidebar when window is resized to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <ProtectedRoute>
      <div className="app-container">
        {/* Sidebar Overlay for Mobile */}
        <div
          className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
          onClick={closeSidebar}
        />

        <Sidebar
          activeItem={activeItem}
          setActiveItem={setActiveItem}
          isMobileOpen={isSidebarOpen}
          isCollapsed={isSidebarCollapsed}
          onClose={closeSidebar}
          onToggleCollapse={toggleSidebarCollapse}
        />

        <div className={`main-layout ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <Header
            theme={theme}
            toggleTheme={toggleTheme}
            title={activeItem}
            onMenuClick={toggleSidebar}
          />
          <main className="content">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

function AppContent() {
  const { activeItem } = useNavigation();

  const renderContent = () => {
    switch (activeItem) {
      case 'Dashboard':
        return <Dashboard />;
      case 'Inventory Overview':
        return <InventoryOverview />;
      case 'Depots':
        return <Depots />;
      case 'Supplier Risk Radar':
        return <SupplierRiskRadar />;
      case 'Reports Export':
        return <Reports />;
      case 'Movement & Transactions':
        return <MovementTransactions />;
      case 'Stock Search & Tracking':
        return <StockSearchTracking />;
      case 'Notifications':
        return <Notifications />;
      case 'Admin Panel':
        return <AdminPanel />;
      case 'AI Chatbot':
        return <Chatbot />;
      case 'Depot Map':
        return <DepotMap />;
      default:
        return (
          <div className="placeholder-view">
            <h2>{activeItem}</h2>
            <p>This module is currently initializing. Connection to Logistics Ledger established.</p>
          </div>
        );
    }
  };

  return renderContent();
}

function App() {
  return (
    <AuthProvider>
      <SupplierRiskProvider>
        <NavigationProvider>
          <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Protected App Shell — all pages rendered via activeItem switch */}
              <Route path="/dashboard" element={<AppLayout><AppContent /></AppLayout>} />

              {/* Product Details Route within AppLayout */}
              <Route
                path="/product/:productId"
                element={
                  <AppLayout>
                    <ProductDetailsView />
                  </AppLayout>
                }
              />

              {/* Catch all - redirect to login */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Router>
        </NavigationProvider>
      </SupplierRiskProvider>
    </AuthProvider>
  );
}

export default App;
