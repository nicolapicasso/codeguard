import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import {
  Users, FolderOpen, QrCode, CheckCircle, Activity,
  Package, Hash, TrendingUp,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { tenants, health, stats } from '../lib/api';

export function Dashboard() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [t, h, o] = await Promise.all([
          tenants.list().catch(() => []),
          health.ready().catch(() => null),
          stats.overview().catch(() => null),
        ]);
        setTenantList(t);
        setHealthStatus(h);
        setOverview(o);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const kpis = overview ? [
    { label: 'Tenants activos', value: overview.active_tenants, total: overview.total_tenants, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Proyectos', value: overview.total_projects, icon: FolderOpen, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Reglas de codigo', value: overview.total_rules, icon: QrCode, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Total validaciones', value: overview.total_redemptions, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Usuarios unicos', value: overview.unique_users, icon: TrendingUp, color: 'text-brand-600', bg: 'bg-brand-50' },
    { label: 'Lotes generados', value: overview.total_batches, icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Codigos generados', value: overview.total_codes_generated, icon: Hash, color: 'text-rose-600', bg: 'bg-rose-50' },
  ] : [];

  const chartData = overview?.recent_activity
    ? [...overview.recent_activity].reverse()
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen general del sistema OmniCodex</p>
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

      {/* KPI grid */}
      {loading ? (
        <p className="text-gray-500 mb-6">Cargando metricas...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="text-center py-4">
                <div className={`inline-flex p-2 rounded-lg ${kpi.bg} ${kpi.color} mb-2`}>
                  <kpi.icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                </p>
                <p className="text-xs text-gray-500 mt-1">{kpi.label}</p>
                {'total' in kpi && kpi.total !== undefined && (
                  <p className="text-xs text-gray-400">de {kpi.total} total</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Activity chart */}
      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="font-semibold">Actividad de validaciones (ultimos 30 dias)</h2>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValidations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3E94AF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3E94AF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d) => {
                    const date = new Date(d);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  formatter={(value: number) => [value.toLocaleString(), 'Validaciones']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#3E94AF"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValidations)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
