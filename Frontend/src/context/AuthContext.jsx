import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { can } from '../utils/permissions';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // Access token lives in memory ONLY (≠ localStorage) to prevent XSS + tab collision.
  // The refresh token lives in a httpOnly cookie managed by the browser.
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Silent refresh: called on app boot and when access token expires.
   * Sends the refresh token cookie to the server and gets a new access token.
   */
  const silentRefresh = async () => {
    try {
      const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      const { token: newToken } = response.data;
      setToken(newToken);
      return newToken;
    } catch {
      // Refresh failed — session expired or revoked
      setToken(null);
      setUser(null);
      return null;
    }
  };

  // On app boot: try silent refresh to restore session (no localStorage needed)
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const newToken = await silentRefresh();
        if (newToken) {
          // Fetch user profile with the fresh access token
          const response = await axios.get('/api/auth/me', {
            headers: { Authorization: `Bearer ${newToken}` }
          });
          if (response.data.user) {
            setUser(response.data.user);
          }
        }
      } catch {
        // No valid session
        setToken(null);
        setUser(null);
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await axios.post('/api/auth/login', { email, password }, { withCredentials: true });
      const { token: accessToken, user } = response.data;
      // Store access token in memory only — not localStorage
      setToken(accessToken);
      setUser(user);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed. Please try again.'
      };
    }
  };

  const signup = async (firstName, lastName, email, password, confirmPassword) => {
    try {
      const response = await axios.post('/api/auth/signup', {
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        confirm_password: confirmPassword
      });

      return {
        success: true,
        message: response.data.message,
        email: email
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Signup failed. Please try again.'
      };
    }
  };

  const verifyOTP = async (email, otp) => {
    try {
      const response = await axios.post('/api/auth/verify-otp', { email, otp }, { withCredentials: true });
      const { token: accessToken, user } = response.data;
      setToken(accessToken);
      setUser(user);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'OTP verification failed.'
      };
    }
  };

  const forgotPassword = async (email) => {
    try {
      const response = await axios.post('/api/auth/forgot-password', { email });
      return {
        success: true,
        message: response.data.message
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send reset code.'
      };
    }
  };

  const resetPassword = async (email, otp, newPassword) => {
    try {
      const response = await axios.post('/api/auth/reset-password', {
        email,
        otp,
        newPassword
      });
      return {
        success: true,
        message: response.data.message
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Password reset failed.'
      };
    }
  };

  const logout = async () => {
    try {
      // Tell the server to revoke the refresh token from Redis and clear the cookie
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch {
      // Logout anyway even if server is unreachable
    }
    setToken(null);
    setUser(null);
    // Clear any legacy localStorage items
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // ============================================================================
  // ROLE & DEPOT AUTHORIZATION HELPERS
  // ============================================================================

  const isAdmin = () => user?.role === 'admin';
  const isManager = () => user?.role === 'manager';
  const isStaff = () => user?.role === 'staff';
  const isViewer = () => user?.role === 'viewer';

  /**
   * Check if the current user has a specific permission.
   * Uses the client-side PERMISSIONS matrix.
   * @param {string} permission — e.g. 'products:write', 'reports:export'
   */
  const hasPermission = (permission) => {
    if (!user?.role) return false;
    return can(user.role, permission);
  };

  /**
   * Check if the current user has write access to a specific depot.
   * Admins have write access to all depots.
   * Staff/managers only have access to their assigned depots.
   */
  const canWriteDepot = (depotId) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'manager') return true; // manager bypass
    if (user.role === 'viewer') return false; // viewer: always read-only
    if (!user.assignedDepots || user.assignedDepots.length === 0) return false;
    return user.assignedDepots.some(
      a => a.depotId === depotId || a.depotId?.toString() === depotId?.toString()
    );
  };

  /**
   * Get the list of depot IDs this user can write to.
   * Returns null for admins (meaning all depots).
   */
  const getWritableDepotIds = () => {
    if (!user) return [];
    if (user.role === 'admin') return null; // null means all depots
    return (user.assignedDepots || []).map(a => a.depotId);
  };

  /**
   * Refresh user data (e.g., after admin assigns new depot)
   */
  const refreshUser = async () => {
    try {
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.user) {
        setUser(response.data.user);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    userRole: user?.role || null,
    login,
    signup,
    verifyOTP,
    forgotPassword,
    resetPassword,
    logout,
    // Role helpers
    isAdmin,
    isManager,
    isStaff,
    isViewer,
    hasPermission,
    canWriteDepot,
    getWritableDepotIds,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
