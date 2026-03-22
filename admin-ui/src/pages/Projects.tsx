import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Plus, BarChart3, ChevronLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { tenants as tenantsApi, projects as projectsApi, stats as statsApi } from '../lib/api';

const COLORS = ['#3E94AF', '#E97451', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function Projects() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', starts_at: '', ends_at: '' });
  const [submitting, setSubmitting] = useState(false);
  // Detail view
  const [detailProject, setDetailProject] = useState<any>(null);
  const [projectStats, setProjectStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    tenantsApi.list().then(setTenantList).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      setLoading(true);
      projectsApi.list(selectedTenant).then(setProjectList).catch(() => setProjectList([])).finally(() => setLoading(false));
    }
  }, [selectedTenant]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { name: formData.name, description: formData.description || undefined };
      if (formData.starts_at) payload.starts_at = new Date(formData.starts_at).toISOString();
      if (formData.ends_at) payload.ends_at = new Date(formData.ends_at).toISOString();
      await projectsApi.create(selectedTenant, payload);
      setShowForm(false);
      setFormData({ name: '', description: '', starts_at: '', ends_at: '' });
      const updated = await projectsApi.list(selectedTenant);
      setProjectList(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await projectsApi.update(id, { is_active: !isActive });
      if (selectedTenant) {
        const updated = await projectsApi.list(selectedTenant);
        setProjectList(updated);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const openProjectDetail = async (project: any) => {
    setDetailProject(project);
    setStatsLoading(true);
    try {
      const st = await statsApi.adminProject(project.id, 30).catch(() => null);
      setProjectStats(st);
    } finally {
      setStatsLoading(false);
    }
  };

  const chartData = projectStats?.by_day ? [...projectStats.by_day].reverse() : [];

  // ========== PROJECT DETAIL VIEW ==========
  if (detailProject) {
    return (
      <div>
        <button
          onClick={() => { setDetailProject(null); setProjectStats(null); }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Volver a Proyectos
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{detailProject.name}</h1>
            <p className="text-gray-500 mt-1">
              {detailProject.description || 'Sin descripcion'}
              {detailProject.startsAt && ` — ${new Date(detailProject.startsAt).toLocaleDateString('es-ES')} a ${detailProject.endsAt ? new Date(detailProject.endsAt).toLocaleDateString('es-ES') : '...'}`}
            </p>
          </div>
          <Badge variant={detailProject.isActive ? 'success' : 'danger'}>
            {detailProject.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>

        {statsLoading ? (
          <p className="text-gray-500">Cargando analitica...</p>
        ) : projectStats ? (
          <>
            {/* KPIs */}
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

            {/* Daily chart */}
            {chartData.length > 0 && (
              <Card className="mb-6">
                <CardHeader><h2 className="font-semibold">Validaciones diarias (30 dias)</h2></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
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
                  <CardHeader><h2 className="font-semibold">Por regla</h2></CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Regla</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Modo</th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">Canjes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectStats.by_rule.map((r: any) => (
                          <tr key={r.rule_id} className="border-b border-gray-50">
                            <td className="py-2 px-2 font-medium">{r.rule_name}</td>
                            <td className="py-2 px-2">
                              <Badge variant={r.generation_mode === 'MANAGED' ? 'success' : 'default'}>
                                {r.generation_mode}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-right font-mono">{r.redemptions.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* By country */}
              {projectStats.by_country && projectStats.by_country.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold">Por pais</h2></CardHeader>
                  <CardContent>
                    <div className="flex flex-col md:flex-row items-center gap-4">
                      <div className="w-44 h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={projectStats.by_country} dataKey="count" nameKey="country" cx="50%" cy="50%" outerRadius={65} innerRadius={30}>
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
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-gray-500 mt-1">Campanas y acuerdos con fabricantes</p>
        </div>
        {selectedTenant && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </button>
        )}
      </div>

      {/* Tenant selector */}
      <Card className="mb-6">
        <CardContent>
          <label className="block text-sm font-medium text-gray-700 mb-2">Selecciona un Tenant</label>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          >
            <option value="">-- Seleccionar --</option>
            {tenantList.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.owTenantId})</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Create form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Crear Proyecto</h2></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
                <input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                <input
                  type="datetime-local"
                  value={formData.starts_at}
                  onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
                <input
                  type="datetime-local"
                  value={formData.ends_at}
                  onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
              <div className="md:col-span-2 flex gap-2">
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

      {/* Projects list */}
      {selectedTenant && (
        <Card>
          <CardContent>
            {loading ? (
              <p className="text-gray-500 py-4">Cargando...</p>
            ) : projectList.length === 0 ? (
              <p className="text-gray-500 py-4">No hay proyectos para este tenant</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Nombre</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Descripcion</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Vigencia</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Reglas</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Estado</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectList.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 px-2 font-medium">{p.name}</td>
                        <td className="py-3 px-2 text-gray-500">{p.description || '-'}</td>
                        <td className="py-3 px-2 text-gray-500 text-xs">
                          {p.startsAt ? new Date(p.startsAt).toLocaleDateString('es-ES') : '...'} - {p.endsAt ? new Date(p.endsAt).toLocaleDateString('es-ES') : '...'}
                        </td>
                        <td className="py-3 px-2">
                          <Badge>{p._count?.codeRules ?? 0}</Badge>
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant={p.isActive ? 'success' : 'danger'}>
                            {p.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex gap-2">
                            <button onClick={() => openProjectDetail(p)} className="text-brand-600 hover:text-brand-800 text-xs font-medium flex items-center gap-1">
                              <BarChart3 className="w-3 h-3" /> Detalle
                            </button>
                            <button onClick={() => handleToggleActive(p.id, p.isActive)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">
                              {p.isActive ? 'Desactivar' : 'Activar'}
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
      )}
    </div>
  );
}
