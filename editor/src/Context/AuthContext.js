import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const serverURL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

// Immediately attach token from localStorage synchronously on module load
const initialSavedToken = localStorage.getItem('cocolabs_token');
if (initialSavedToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${initialSavedToken}`;
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(initialSavedToken || null);
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('cocolabs_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });
  const loading = false;

  // Sync axios header whenever token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('cocolabs_token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('cocolabs_token');
      localStorage.removeItem('cocolabs_user');
    }
  }, [token]);

  // Verify token in background
  useEffect(() => {
    const verifyToken = async () => {
      const currentToken = localStorage.getItem('cocolabs_token');
      if (currentToken) {
        try {
          const res = await axios.get(`${serverURL}/auth/me`);
          if (res.data && res.data.user) {
            setUser(res.data.user);
            localStorage.setItem('cocolabs_user', JSON.stringify(res.data.user));
          }
        } catch (err) {
          console.warn('[Auth] Background verify failed:', err.message);
          if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            logout();
          }
        }
      }
    };

    verifyToken();
  }, []);

  const login = async (email, password) => {
    const res = await axios.post(`${serverURL}/auth/login`, { email, password });
    const { token: receivedToken, user: receivedUser } = res.data;
    setToken(receivedToken);
    setUser(receivedUser);
    localStorage.setItem('cocolabs_token', receivedToken);
    localStorage.setItem('cocolabs_user', JSON.stringify(receivedUser));
    axios.defaults.headers.common['Authorization'] = `Bearer ${receivedToken}`;
    return receivedUser;
  };

  const signup = async (name, email, password) => {
    const res = await axios.post(`${serverURL}/auth/signup`, { name, email, password });
    const { token: receivedToken, user: receivedUser } = res.data;
    setToken(receivedToken);
    setUser(receivedUser);
    localStorage.setItem('cocolabs_token', receivedToken);
    localStorage.setItem('cocolabs_user', JSON.stringify(receivedUser));
    axios.defaults.headers.common['Authorization'] = `Bearer ${receivedToken}`;
    return receivedUser;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('cocolabs_token');
    localStorage.removeItem('cocolabs_user');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        login,
        signup,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
