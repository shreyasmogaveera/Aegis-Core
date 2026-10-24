import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import socketService from '../services/socketService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('aegis_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await authService.getCurrentUser(token);
          setUser(res.user);
          socketService.reconnect();
        } catch (err) {
          console.warn('Token validation failed, clearing token');
          localStorage.removeItem('aegis_token');
          setToken(null);
          setUser(null);
          socketService.reconnect();
        }
      } else {
        socketService.reconnect();
      }
      setLoading(false);
    };

    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const res = await authService.login(email, password);
    localStorage.setItem('aegis_token', res.token);
    setToken(res.token);
    setUser(res.user);
    socketService.reconnect();
    return res.user;
  };

  const register = async (fullname, email, phone, password) => {
    return await authService.register(fullname, email, phone, password);
  };

  const logout = () => {
    localStorage.removeItem('aegis_token');
    setToken(null);
    setUser(null);
    socketService.reconnect();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
