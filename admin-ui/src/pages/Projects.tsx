import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Plus } from 'lucide-react';
import { tenants as tenantsApi, projects as projectsApi } from '../lib/api';

export function Projects() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', starts_at: '', ends_at: '' });
  const [submitting, setSubmitting] = useState(false);

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
                          <button onClick={() => handleToggleActive(p.id, p.isActive)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">
                            {p.isActive ? 'Desactivar' : 'Activar'}
                          </button>
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
