import { Navigate, useLocation } from 'react-router-dom';

/**
 * Wraps routes that require authentication.
 * Reads the JWT from localStorage — if absent, redirects to /login,
 * preserving the attempted path so the user can be sent back after login.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('auth_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
