import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { tenants as tenantsApi, projects as projectsApi, stats as statsApi } from '../lib/api';

const COLORS = ['#3E94AF', '#E97451', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function Stats() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [tenantStats, setTenantStats] = useState<any>(null);
  const [projectStats, setProjectStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => { tenantsApi.list().then(setTenantList).catch(() => {}); }, []);

  useEffect(() => {
    if (selectedTenant) {
      projectsApi.list(selectedTenant).then(setProjectList).catch(() => setProjectList([]));
      setSelectedProject('');
      setProjectStats(null);
      loadTenantStats(selectedTenant);
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (selectedTenant) loadTenantStats(selectedTenant);
  }, [days]);

  useEffect(() => {
    if (selectedProject) loadProjectStats(selectedProject);
  }, [selectedProject, days]);

  const loadTenantStats = async (tenantId: string) => {
    setLoading(true);
    try {
      const data = await statsApi.tenant(tenantId, days);
      setTenantStats(data);
    } catch {
      setTenantStats(null);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectStats = async (projectId: string) => {
    setLoading(true);
    try {
      const data = await statsApi.adminProject(projectId, days);
      setProjectStats(data);
    } catch {
      setProjectStats(null);
    } finally {
      setLoading(false);
    }
  };

  // Build multi-project time series for tenant view
  const tenantChartData = useMemo(() => {
    if (!tenantStats?.by_day || tenantStats.by_day.length === 0) return [];
    const projectNames = new Map(projectList.map((p) => [p.id, p.name]));
    const dateMap = new Map<string, Record<string, number>>();

    for (const entry of tenantStats.by_day) {
      const name = projectNames.get(entry.project_id) || entry.project_id;
      if (!dateMap.has(entry.date)) dateMap.set(entry.date, { date: entry.date } as any);
      const row = dateMap.get(entry.date)!;
      (row as any)[name] = (entry.count || 0);
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date < b.date ? -1 : 1);
  }, [tenantStats, projectList]);

  const tenantProjectNames = useMemo(() => {
    if (!tenantStats?.by_day) return [];
    const projectNames = new Map(projectList.map((p) => [p.id, p.name]));
    const names = new Set<string>();
    for (const entry of tenantStats.by_day) {
      names.add(projectNames.get(entry.project_id) || entry.project_id);
    }
    return Array.from(names);
  }, [tenantStats, projectList]);

  // Project chart data
  const projectChartData = useMemo(() => {
    if (!projectStats?.by_day) return [];
    return [...projectStats.by_day].reverse();
  }, [projectStats]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analitica</h1>
          <p className="text-gray-500 mt-1">Metricas de validaciones, codigos generados y uso por proyecto</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
        >
          <option value={7}>7 dias</option>
          <option value={14}>14 dias</option>
          <option value={30}>30 dias</option>
          <option value={60}>60 dias</option>
          <option value={90}>90 dias</option>
        </select>
      </div>

      {/* Selectors */}
      <Card className="mb-6">
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
              <select value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                <option value="">-- Seleccionar Tenant --</option>
                {tenantList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto (detalle)</label>
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} disabled={!selectedTenant}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                <option value="">-- Vista general del tenant --</option>
                {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-gray-500 mb-4">Cargando analitica...</p>}

      {/* ========== TENANT VIEW ========== */}
      {tenantStats && !selectedProject && (
        <>
          {/* Tenant KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{tenantStats.total_redemptions.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Validaciones totales</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{tenantStats.unique_users.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Usuarios unicos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{tenantStats.total_batches}</p>
                <p className="text-xs text-gray-500 mt-1">Lotes generados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{tenantStats.total_codes_generated.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Codigos generados</p>
              </CardContent>
            </Card>
          </div>

          {/* Multi-project line chart */}
          {tenantChartData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <h2 className="font-semibold">Validaciones por proyecto (ultimos {days} dias)</h2>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={tenantChartData}>
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
                      labelFormatter={(d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    />
                    <Legend />
                    {tenantProjectNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* By project table */}
          {tenantStats.by_project && tenantStats.by_project.length > 0 && (
            <Card className="mb-6">
              <CardHeader><h2 className="font-semibold">Validaciones por proyecto</h2></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Proyecto</th>
                        <th className="text-right py-3 px-2 font-medium text-gray-500">Validaciones</th>
                        <th className="text-right py-3 px-2 font-medium text-gray-500">% del total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantStats.by_project.map((p: any) => (
                        <tr key={p.project_id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-3 px-2 font-medium">{p.project_name}</td>
                          <td className="py-3 px-2 text-right font-mono">{p.redemptions.toLocaleString()}</td>
                          <td className="py-3 px-2 text-right text-gray-500">
                            {tenantStats.total_redemptions > 0
                              ? `${((p.redemptions / tenantStats.total_redemptions) * 100).toFixed(1)}%`
                              : '-'}
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

      {/* ========== PROJECT VIEW ========== */}
      {projectStats && selectedProject && (
        <>
          {/* Project KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{projectStats.total_redemptions.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Validaciones</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{projectStats.unique_users.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Usuarios unicos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{projectStats.total_batches}</p>
                <p className="text-xs text-gray-500 mt-1">Lotes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-gray-900">{projectStats.total_codes_generated.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Codigos generados</p>
              </CardContent>
            </Card>
          </div>

          {/* Time series chart */}
          {projectChartData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <h2 className="font-semibold">Validaciones diarias (ultimos {days} dias)</h2>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={projectChartData}>
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
                      labelFormatter={(d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      formatter={(value: number) => [value.toLocaleString(), 'Validaciones']}
                    />
                    <Bar dataKey="count" fill="#3E94AF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* By rule */}
            {projectStats.by_rule && projectStats.by_rule.length > 0 && (
              <Card>
                <CardHeader><h2 className="font-semibold">Validaciones por regla</h2></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Regla</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Modo</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-500">Canjes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectStats.by_rule.map((r: any) => (
                          <tr key={r.rule_id} className="border-b border-gray-50">
                            <td className="py-3 px-2 font-medium">{r.rule_name}</td>
                            <td className="py-3 px-2">
                              <Badge variant={r.generation_mode === 'MANAGED' ? 'success' : 'default'}>
                                {r.generation_mode}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-right font-mono">{r.redemptions.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* By country */}
            {projectStats.by_country && projectStats.by_country.length > 0 && (
              <Card>
                <CardHeader><h2 className="font-semibold">Validaciones por pais</h2></CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="w-48 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={projectStats.by_country}
                            dataKey="count"
                            nameKey="country"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={35}
                          >
                            {projectStats.by_country.map((_: any, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => value.toLocaleString()} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1">
                      {projectStats.by_country.map((c: any, i: number) => (
                        <div key={c.country} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="font-medium">{c.country}</span>
                          </div>
                          <span className="text-gray-500 font-mono">{c.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!selectedTenant && (
        <div className="text-center py-12 text-gray-400">
          Selecciona un tenant para ver la analitica
        </div>
      )}
    </div>
  );
}
