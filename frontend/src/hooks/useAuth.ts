import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await authService.getUser();
      setUser(currentUser);
    } catch (error) {
      console.warn('Not authenticated or session expired:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = useCallback(() => {
    const loginUrl = authService.getLoginUrl();
    window.location.href = loginUrl;
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isAuthenticated = Boolean(user);

  return {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated,
    checkAuthStatus,
  };
};
