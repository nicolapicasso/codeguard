import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Plus, RotateCcw, Eye, EyeOff, Globe, BarChart3, ChevronLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { tenants as tenantsApi, projects as projectsApi, stats as statsApi } from '../lib/api';
import { useApi } from '../hooks/useApi';

const COLORS = ['#3E94AF', '#E97451', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function Tenants() {
  const { data: tenantList, loading, error, refetch } = useApi(() => tenantsApi.list());
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ ow_tenant_id: '', name: '', webhook_url: '', banned_countries: '' });
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Detail view
  const [detailView, setDetailView] = useState<any>(null);
  const [tenantStats, setTenantStats] = useState<any>(null);
  const [projectList, setProjectList] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const bannedCountries = formData.banned_countries
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2);
      await tenantsApi.create({
        ow_tenant_id: formData.ow_tenant_id,
        name: formData.name,
        webhook_url: formData.webhook_url || undefined,
        banned_countries: bannedCountries.length > 0 ? bannedCountries : undefined,
      });
      setShowForm(false);
      setFormData({ ow_tenant_id: '', name: '', webhook_url: '', banned_countries: '' });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error creating tenant');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRotateKeys = async (id: string) => {
    if (!confirm('Esto invalidara las claves actuales. Continuar?')) return;
    try {
      const result = await tenantsApi.rotateKeys(id);
      setSelectedTenant(result);
      setShowSecret(true);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error rotating keys');
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await tenantsApi.update(id, { is_active: !isActive });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error updating tenant');
    }
  };

  const loadDetail = async (id: string) => {
    const detail = await tenantsApi.get(id);
    setSelectedTenant(detail);
    setShowSecret(false);
  };

  const openDetailView = async (tenant: any) => {
    setDetailView(tenant);
    setStatsLoading(true);
    try {
      const [st, prj] = await Promise.all([
        statsApi.tenant(tenant.id, 30).catch(() => null),
        projectsApi.list(tenant.id).catch(() => []),
      ]);
      setTenantStats(st);
      setProjectList(prj);
    } finally {
      setStatsLoading(false);
    }
  };

  // Build multi-project chart data
  const chartData = (() => {
    if (!tenantStats?.by_day || tenantStats.by_day.length === 0) return [];
    const projectNames = new Map(projectList.map((p) => [p.id, p.name]));
    const dateMap = new Map<string, Record<string, any>>();
    for (const entry of tenantStats.by_day) {
      const name = projectNames.get(entry.project_id) || entry.project_id;
      if (!dateMap.has(entry.date)) dateMap.set(entry.date, { date: entry.date });
      dateMap.get(entry.date)![name] = entry.count || 0;
    }
    return Array.from(dateMap.values()).sort((a, b) => a.date < b.date ? -1 : 1);
  })();

  const projectNames = (() => {
    if (!tenantStats?.by_day) return [];
    const pNames = new Map(projectList.map((p) => [p.id, p.name]));
    const names = new Set<string>();
    for (const entry of tenantStats.by_day) {
      names.add(pNames.get(entry.project_id) || entry.project_id);
    }
    return Array.from(names);
  })();

  // ========== DETAIL VIEW ==========
  if (detailView) {
    return (
      <div>
        <button
          onClick={() => { setDetailView(null); setTenantStats(null); setProjectList([]); }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Volver a Tenants
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{detailView.name}</h1>
            <p className="text-gray-500 mt-1">OW ID: {detailView.owTenantId} — {detailView.isActive ? 'Activo' : 'Inactivo'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => loadDetail(detailView.id)} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              <Eye className="w-3.5 h-3.5" /> API Keys
            </button>
            <button onClick={() => handleRotateKeys(detailView.id)} className="flex items-center gap-1 px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
              <RotateCcw className="w-3.5 h-3.5" /> Rotar Keys
            </button>
          </div>
        </div>

        {/* API Keys panel */}
        {selectedTenant && selectedTenant.id === detailView.id && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Credenciales API</h2>
                <button onClick={() => setSelectedTenant(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {selectedTenant.api_key && (
                  <>
                    <div>
                      <span className="font-medium text-gray-500">API Key:</span>
                      <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs break-all">{selectedTenant.api_key}</code>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">API Secret:</span>
                      <button onClick={() => setShowSecret(!showSecret)} className="ml-2 text-brand-600">
                        {showSecret ? <EyeOff className="w-4 h-4 inline" /> : <Eye className="w-4 h-4 inline" />}
                      </button>
                      {showSecret && (
                        <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs break-all">{selectedTenant.api_secret}</code>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {statsLoading ? (
          <p className="text-gray-500">Cargando analitica...</p>
        ) : tenantStats ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="text-center py-4">
                  <p className="text-3xl font-bold text-gray-900">{tenantStats.total_redemptions.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Validaciones</p>
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
                  <p className="text-xs text-gray-500 mt-1">Lotes</p>
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
            {chartData.length > 0 && (
              <Card className="mb-6">
                <CardHeader><h2 className="font-semibold">Validaciones por proyecto (30 dias)</h2></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} />
                      <Legend />
                      {projectNames.map((name, i) => (
                        <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* By project table */}
            {tenantStats.by_project && tenantStats.by_project.length > 0 && (
              <Card className="mb-6">
                <CardHeader><h2 className="font-semibold">Desglose por proyecto</h2></CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            )}

            {/* Banned countries info */}
            {detailView.bannedCountries && detailView.bannedCountries.length > 0 && (
              <Card>
                <CardContent>
                  <span className="text-sm font-medium text-gray-500">Paises baneados: </span>
                  <span className="inline-flex gap-1 flex-wrap ml-2">
                    {detailView.bannedCountries.map((c: string) => (
                      <span key={c} className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-mono">{c}</span>
                    ))}
                  </span>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">Sin datos de analitica disponibles</div>
        )}
      </div>
    );
  }

  // ========== LIST VIEW ==========
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-gray-500 mt-1">Gestion de clientes OmniWallet</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nuevo Tenant
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Crear Tenant</h2></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OW Tenant ID</label>
                <input
                  required
                  value={formData.ow_tenant_id}
                  onChange={(e) => setFormData({ ...formData, ow_tenant_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="ow-tenant-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="Mi Empresa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                <input
                  value={formData.webhook_url}
                  onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="https://..."
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe className="w-4 h-4 inline mr-1" />
                  Paises baneados (ISO alpha-2, separados por coma)
                </label>
                <input
                  value={formData.banned_countries}
                  onChange={(e) => setFormData({ ...formData, banned_countries: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="KP, IR, CU, SY (vacio = sin restriccion)"
                />
                <p className="text-xs text-gray-400 mt-1">Codigos escaneados desde estos paises seran rechazados para TODOS los proyectos de este tenant</p>
              </div>
              <div className="md:col-span-3 flex gap-2">
                <button type="submit" disabled={submitting} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50">
                  {submitting ? 'Creando...' : 'Crear'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tenants table */}
      <Card>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 py-4">Cargando...</p>
          ) : error ? (
            <p className="text-red-500 py-4">{error}</p>
          ) : !tenantList || tenantList.length === 0 ? (
            <p className="text-gray-500 py-4">No hay tenants</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Nombre</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">OW ID</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Estado</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Geo-ban</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Creado</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantList.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-2 font-medium">{t.name}</td>
                      <td className="py-3 px-2 text-gray-500 font-mono text-xs">{t.owTenantId}</td>
                      <td className="py-3 px-2">
                        <Badge variant={t.isActive ? 'success' : 'danger'}>
                          {t.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        {t.bannedCountries && t.bannedCountries.length > 0 ? (
                          <span className="inline-flex gap-0.5 flex-wrap">
                            {t.bannedCountries.slice(0, 3).map((c: string) => (
                              <span key={c} className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs font-mono">{c}</span>
                            ))}
                            {t.bannedCountries.length > 3 && (
                              <span className="text-xs text-gray-400">+{t.bannedCountries.length - 3}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-500">{new Date(t.createdAt).toLocaleDateString('es-ES')}</td>
                      <td className="py-3 px-2">
                        <div className="flex gap-2">
                          <button onClick={() => openDetailView(t)} className="text-brand-600 hover:text-brand-800 text-xs font-medium flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> Detalle
                          </button>
                          <button onClick={() => handleToggleActive(t.id, t.isActive)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">
                            {t.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                          <button onClick={() => handleRotateKeys(t.id)} className="text-red-600 hover:text-red-800 text-xs font-medium flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" /> Keys
                          </button>
                        </div>
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
