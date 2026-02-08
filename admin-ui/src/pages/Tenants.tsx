import { useState } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Plus, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { tenants as tenantsApi } from '../lib/api';
import { useApi } from '../hooks/useApi';

export function Tenants() {
  const { data: tenantList, loading, error, refetch } = useApi(() => tenantsApi.list());
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ ow_tenant_id: '', name: '', webhook_url: '' });
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await tenantsApi.create(formData);
      setShowForm(false);
      setFormData({ ow_tenant_id: '', name: '', webhook_url: '' });
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

      {/* Tenant detail modal */}
      {selectedTenant && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{selectedTenant.name || 'Detalle Tenant'}</h2>
              <button onClick={() => setSelectedTenant(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
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
              {selectedTenant.projects && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-500">Proyectos: </span>
                  {selectedTenant.projects.length === 0 ? 'Ninguno' : selectedTenant.projects.map((p: any) => p.name).join(', ')}
                </div>
              )}
            </div>
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
                      <td className="py-3 px-2 text-gray-500">{new Date(t.createdAt).toLocaleDateString('es-ES')}</td>
                      <td className="py-3 px-2">
                        <div className="flex gap-2">
                          <button onClick={() => loadDetail(t.id)} className="text-brand-600 hover:text-brand-800 text-xs font-medium">Ver</button>
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
