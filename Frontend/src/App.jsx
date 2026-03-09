import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import InventoryOverview from './pages/InventoryOverview';
import ProductDetailsView from './pages/ProductDetailsView';
import Depots from './pages/Depots';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyOTP from './pages/VerifyOTP';
import ForgotPassword from './pages/ForgotPassword';
import ForecastingAnalysis from './pages/ForecastingAnalysis';
import Reports from './pages/Reports';
import MovementTransactions from './pages/MovementTransactions';
import StockSearchTracking from './pages/StockSearchTracking';
import Notifications from './pages/Notifications';
import AdminPanel from './pages/AdminPanel';


function App() {
  const [theme, setTheme] = useState('light');
  const [activeItem, setActiveItem] = useState('Dashboard');
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

  const renderContent = () => {
    switch (activeItem) {
      case 'Dashboard':
        return <Dashboard />;
      case 'Inventory Overview':
        return <InventoryOverview />;
      case 'Depots':
        return <Depots />;
      case 'Supplier Risk Radar':
        return <ForecastingAnalysis />;
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
      default:
        return (
          <div className="placeholder-view">
            <h2>{activeItem}</h2>
            <p>This module is currently initializing. Connection to Logistics Ledger established.</p>
          </div>
        );
    }
  };

  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-otp" element={<VerifyOTP />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
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
                      {renderContent()}
                    </main>
                  </div>
                </div>
              </ProtectedRoute>
            }
          />

          {/* Product Details Route */}
          <Route
            path="/product/:productId"
            element={
              <ProtectedRoute>
                <ProductDetailsView />
              </ProtectedRoute>
            }
          />

          {/* Catch all - redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
