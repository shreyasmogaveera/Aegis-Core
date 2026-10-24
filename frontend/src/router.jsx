import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AdminLayout } from './components/layout/AdminLayout';
import { UserLayout } from './components/layout/UserLayout';

import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ForgotPassword } from './pages/auth/ForgotPassword';

import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminRiskMap } from './pages/admin/AdminRiskMap';
import { AdminRiskAnalysis } from './pages/admin/AdminRiskAnalysis';
import { AdminActiveAlerts } from './pages/admin/AdminActiveAlerts';
import { AdminAIPredictions } from './pages/admin/AdminAIPredictions';
import { AdminEmergencyManagement } from './pages/admin/AdminEmergencyManagement';
import { AdminShelterManagement } from './pages/admin/AdminShelterManagement';
import { AdminProfile } from './pages/admin/AdminProfile';

import { UserDashboard } from './pages/user/UserDashboard';
import { UserRiskMap } from './pages/user/UserRiskMap';
import { UserAlerts } from './pages/user/UserAlerts';
import { UserEmergencySOS } from './pages/user/UserEmergencySOS';
import { UserSafeShelters } from './pages/user/UserSafeShelters';
import { UserProfile } from './pages/user/UserProfile';

const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-primary">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-4xl animate-spin">sync</span>
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
            Initializing AegisCore...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'} replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />
  },
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '/register',
    element: <Register />
  },
  {
    path: '/forgot-password',
    element: <ForgotPassword />
  },
  // ADMIN PROTECTED ROUTES
  {
    element: <ProtectedRoute allowedRoles={['admin']} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/dashboard', element: <AdminDashboard /> },
          { path: '/admin/risk-map', element: <AdminRiskMap /> },
          { path: '/admin/risk-analysis', element: <AdminRiskAnalysis /> },
          { path: '/admin/alerts', element: <AdminActiveAlerts /> },
          { path: '/admin/predictions', element: <AdminAIPredictions /> },
          { path: '/admin/emergency', element: <AdminEmergencyManagement /> },
          { path: '/admin/shelters', element: <AdminShelterManagement /> },
          { path: '/admin/profile', element: <AdminProfile /> }
        ]
      }
    ]
  },
  // USER PROTECTED ROUTES
  {
    element: <ProtectedRoute allowedRoles={['user']} />,
    children: [
      {
        element: <UserLayout />,
        children: [
          { path: '/user/dashboard', element: <UserDashboard /> },
          { path: '/user/risk-map', element: <UserRiskMap /> },
          { path: '/user/alerts', element: <UserAlerts /> },
          { path: '/user/emergency', element: <UserEmergencySOS /> },
          { path: '/user/shelters', element: <UserSafeShelters /> },
          { path: '/user/profile', element: <UserProfile /> }
        ]
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);
