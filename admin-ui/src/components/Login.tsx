import { useState } from 'react';
import { Shield } from 'lucide-react';
import { setToken } from '../lib/api';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [token, setTokenInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token.trim()) {
      setError('Token requerido');
      return;
    }

    // Validate token by trying to fetch tenants
    setToken(token.trim());
    try {
      const res = await fetch('/api/admin/tenants', {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (!res.ok) {
        setToken(null);
        setError('Token invalido o expirado');
        return;
      }
      onLogin();
    } catch {
      setToken(null);
      setError('No se pudo conectar con el servidor');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Shield className="w-8 h-8 text-emerald-600" />
          <h1 className="text-2xl font-bold text-gray-900">CodeGuard Admin</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              JWT Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              placeholder="Introduce tu JWT token"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            className="w-full bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors font-medium"
          >
            Acceder
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500 text-center">
          El token JWT se puede generar desde la API del backend.
        </p>
      </div>
    </div>
  );
}
