import { createBrowserRouter, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import IncidentListPage from './pages/IncidentListPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import CreateIncidentPage from './pages/CreateIncidentPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ProtectedRoute from './components/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/incidents" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/incidents',
    element: (
      <ProtectedRoute>
        <IncidentListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/incidents/new',
    element: (
      <ProtectedRoute>
        <CreateIncidentPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/incidents/:id',
    element: (
      <ProtectedRoute>
        <IncidentDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/users',
    element: (
      <ProtectedRoute>
        <UsersPage />
      </ProtectedRoute>
    ),
  },
]);
