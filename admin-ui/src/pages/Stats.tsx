import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { tenants as tenantsApi, projects as projectsApi, stats as statsApi } from '../lib/api';

export function Stats() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [statsData, setStatsData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { tenantsApi.list().then(setTenantList).catch(() => {}); }, []);

  useEffect(() => {
    if (selectedTenant) {
      projectsApi.list(selectedTenant).then(setProjectList).catch(() => setProjectList([]));
      setSelectedProject('');
      setStatsData(null);
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (selectedProject) {
      setLoading(true);
      setError('');
      statsApi.project(selectedProject)
        .then(setStatsData)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [selectedProject]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estadisticas</h1>
        <p className="text-gray-500 mt-1">Metricas de canjes por proyecto</p>
      </div>

      {/* Selectors */}
      <Card className="mb-6">
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
              <select value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="">-- Seleccionar Tenant --</option>
                {tenantList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto</label>
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} disabled={!selectedTenant}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="">-- Seleccionar Proyecto --</option>
                {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-gray-500">Cargando estadisticas...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {statsData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Total canjes</p>
                <p className="text-3xl font-bold text-gray-900">{statsData.total_redemptions.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Usuarios unicos</p>
                <p className="text-3xl font-bold text-gray-900">{statsData.unique_users.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Reglas activas</p>
                <p className="text-3xl font-bold text-gray-900">{statsData.by_rule?.length ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          {statsData.by_day && statsData.by_day.length > 0 && (
            <Card className="mb-6">
              <CardHeader><h2 className="font-semibold">Canjes por dia (ultimos 30 dias)</h2></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[...statsData.by_day].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* By rule */}
          {statsData.by_rule && statsData.by_rule.length > 0 && (
            <Card>
              <CardHeader><h2 className="font-semibold">Canjes por regla</h2></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Regla</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Canjes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statsData.by_rule.map((r: any) => (
                        <tr key={r.rule_id} className="border-b border-gray-50">
                          <td className="py-3 px-2">{r.rule_name}</td>
                          <td className="py-3 px-2">
                            <Badge>{r.count}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
