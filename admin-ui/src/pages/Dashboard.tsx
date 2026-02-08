import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/Card';
import { Badge } from '../components/Badge';
import { Users, FolderOpen, QrCode, CheckCircle, Activity } from 'lucide-react';
import { tenants, health } from '../lib/api';

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

export function Dashboard() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [t, h] = await Promise.all([
          tenants.list().catch(() => []),
          health.ready().catch(() => null),
        ]);
        setTenantList(t);
        setHealthStatus(h);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats: StatCard[] = [
    { label: 'Tenants', value: tenantList.length, icon: Users, color: 'text-blue-600' },
    { label: 'Tenants activos', value: tenantList.filter((t) => t.isActive).length, icon: CheckCircle, color: 'text-emerald-600' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen general del sistema CodeGuard</p>
      </div>

      {/* Health status */}
      <div className="mb-6">
        <Card>
          <CardContent className="flex items-center gap-4 py-3">
            <Activity className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Estado del sistema:</span>
            {loading ? (
              <Badge>Cargando...</Badge>
            ) : healthStatus ? (
              <>
                <Badge variant="success">PostgreSQL OK</Badge>
                <Badge variant="success">Redis OK</Badge>
              </>
            ) : (
              <Badge variant="danger">No conectado</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4">
              <div className={`p-3 rounded-lg bg-gray-50 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : stat.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent tenants */}
      <Card>
        <CardContent>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tenants recientes</h2>
          {loading ? (
            <p className="text-gray-500">Cargando...</p>
          ) : tenantList.length === 0 ? (
            <p className="text-gray-500">No hay tenants creados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Nombre</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">OW Tenant ID</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Estado</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantList.slice(0, 5).map((t) => (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="py-2 px-2 font-medium">{t.name}</td>
                      <td className="py-2 px-2 text-gray-500">{t.owTenantId}</td>
                      <td className="py-2 px-2">
                        <Badge variant={t.isActive ? 'success' : 'danger'}>
                          {t.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-gray-500">
                        {new Date(t.createdAt).toLocaleDateString('es-ES')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
