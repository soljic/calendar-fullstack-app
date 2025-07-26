import axios from 'axios';
import { User } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export const authService = {
  getLoginUrl: (): string => {
    return `${API_URL}/api/v1/auth/google`;
  },

  getUser: async (): Promise<User> => {
    const response = await axios.get(`${API_URL}/api/v1/auth/me`, {
      withCredentials: true, 
    });
    return response.data.data;
  },

  logout: async (): Promise<void> => {
    try {
      await axios.post(`${API_URL}/api/v1/auth/logout`, {}, {
        withCredentials: true,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  refreshToken: async (): Promise<void> => {
    try {
      await axios.post(`${API_URL}/api/v1/auth/refresh`, {}, {
        withCredentials: true,
      });
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
  },

  getStoredUser: (): null => null,
  getStoredTokens: (): null => null,
  isTokenValid: (): boolean => false,
};
