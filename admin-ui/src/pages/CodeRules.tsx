import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { tenants as tenantsApi, projects as projectsApi, codeRules as rulesApi } from '../lib/api';
import { RuleBuilder } from './RuleBuilder';

export function CodeRules() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    tenantsApi.list().then(setTenantList).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      projectsApi.list(selectedTenant).then(setProjectList).catch(() => setProjectList([]));
      setSelectedProject('');
      setRules([]);
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (selectedProject) {
      refreshRules();
    }
  }, [selectedProject]);

  const refreshRules = async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const updated = await rulesApi.list(selectedProject);
      setRules(updated);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRuleCreated = async () => {
    setShowBuilder(false);
    await refreshRules();
  };

  const loadRuleDetail = async (id: string) => {
    const detail = await rulesApi.get(id);
    setSelectedRule(detail);
    setEditing(false);
  };

  const startEditing = (rule: any) => {
    setEditForm({
      name: rule.name || '',
      sku_reference: rule.skuReference || '',
      is_active: rule.isActive,
      max_redemptions: rule.maxRedemptions || 1,
      points_value: rule.pointsValue || 0,
      product_info: JSON.stringify(rule.productInfo || {}, null, 2),
      campaign_info: JSON.stringify(rule.campaignInfo || {}, null, 2),
      allowed_countries: (rule.allowedCountries || []).join(', '),
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      let parsedProduct = {};
      let parsedCampaign = {};
      try { parsedProduct = JSON.parse(editForm.product_info); } catch { /* ignore */ }
      try { parsedCampaign = JSON.parse(editForm.campaign_info); } catch { /* ignore */ }

      const countries = editForm.allowed_countries
        .split(',')
        .map((c: string) => c.trim().toUpperCase())
        .filter((c: string) => c.length === 2);

      await rulesApi.update(selectedRule.id, {
        name: editForm.name,
        sku_reference: editForm.sku_reference || undefined,
        is_active: editForm.is_active,
        max_redemptions: editForm.max_redemptions,
        points_value: editForm.points_value || undefined,
        product_info: parsedProduct,
        campaign_info: parsedCampaign,
        allowed_countries: countries.length > 0 ? countries : [],
      });

      const updated = await rulesApi.get(selectedRule.id);
      setSelectedRule(updated);
      setEditing(false);
      await refreshRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error actualizando regla');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await rulesApi.delete(id);
      if (selectedRule?.id === id) {
        setSelectedRule(null);
        setEditing(false);
      }
      setDeleteConfirm(null);
      await refreshRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error eliminando regla');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reglas de Codigo</h1>
          <p className="text-gray-500 mt-1">Define estructura, charset y algoritmo de validacion</p>
        </div>
        {selectedProject && (
          <button
            onClick={() => setShowBuilder(!showBuilder)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nueva Regla
          </button>
        )}
      </div>

      {/* Selectors */}
      <Card className="mb-6">
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">-- Seleccionar Tenant --</option>
                {tenantList.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                disabled={!selectedTenant}
              >
                <option value="">-- Seleccionar Proyecto --</option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rule builder */}
      {showBuilder && selectedProject && (
        <RuleBuilder projectId={selectedProject} onCreated={handleRuleCreated} onCancel={() => setShowBuilder(false)} />
      )}

      {/* Rule detail / edit */}
      {selectedRule && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{editing ? 'Editar Regla' : selectedRule.name}</h2>
              <div className="flex items-center gap-2">
                {!editing && (
                  <button onClick={() => startEditing(selectedRule)} className="flex items-center gap-1 text-emerald-600 hover:text-emerald-800 text-sm font-medium">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                )}
                <button onClick={() => { setSelectedRule(null); setEditing(false); }} className="text-gray-400 hover:text-gray-600 text-sm">
                  Cerrar
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU Referencia</label>
                    <input
                      value={editForm.sku_reference}
                      onChange={(e) => setEditForm({ ...editForm, sku_reference: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max canjes</label>
                    <input
                      type="number"
                      min={1}
                      value={editForm.max_redemptions}
                      onChange={(e) => setEditForm({ ...editForm, max_redemptions: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Puntos</label>
                    <input
                      type="number"
                      value={editForm.points_value}
                      onChange={(e) => setEditForm({ ...editForm, points_value: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm pb-2">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Activa
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Geo-fencing (paises permitidos, ISO alpha-2)
                  </label>
                  <input
                    value={editForm.allowed_countries}
                    onChange={(e) => setEditForm({ ...editForm, allowed_countries: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="ES, MX, AR (vacio = sin restriccion)"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Info (JSON)</label>
                    <textarea
                      value={editForm.product_info}
                      onChange={(e) => setEditForm({ ...editForm, product_info: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Info (JSON)</label>
                    <textarea
                      value={editForm.campaign_info}
                      onChange={(e) => setEditForm({ ...editForm, campaign_info: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {/* Non-editable structural fields shown as read-only info */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 mb-2">Campos estructurales (no editables — requieren crear una regla nueva)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div><span className="text-gray-400">Longitud:</span> {selectedRule.totalLength}</div>
                    <div><span className="text-gray-400">Charset:</span> {selectedRule.charset}</div>
                    <div><span className="text-gray-400">Algoritmo:</span> {selectedRule.checkAlgorithm || 'Ninguno'}</div>
                    <div><span className="text-gray-400">Prefijo:</span> {selectedRule.prefix || 'Ninguno'}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 font-medium"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    <X className="w-4 h-4" /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">SKU:</span> {selectedRule.skuReference || '-'}</div>
                <div><span className="text-gray-500">Longitud:</span> {selectedRule.totalLength}</div>
                <div><span className="text-gray-500">Charset:</span> <Badge>{selectedRule.charset}</Badge></div>
                <div><span className="text-gray-500">Algoritmo:</span> <Badge>{selectedRule.checkAlgorithm || 'Ninguno'}</Badge></div>
                <div><span className="text-gray-500">Separador:</span> {selectedRule.separator || 'Ninguno'}</div>
                <div><span className="text-gray-500">Prefijo:</span> {selectedRule.prefix || 'Ninguno'}</div>
                <div><span className="text-gray-500">Max canjes:</span> {selectedRule.maxRedemptions}</div>
                <div><span className="text-gray-500">Puntos:</span> {selectedRule.pointsValue || '-'}</div>
                <div><span className="text-gray-500">Paises:</span> {(selectedRule.allowedCountries || []).length > 0 ? selectedRule.allowedCountries.join(', ') : 'Todos'}</div>
                <div>
                  <span className="text-gray-500">Estado:</span>{' '}
                  <Badge variant={selectedRule.isActive ? 'success' : 'danger'}>
                    {selectedRule.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Canjes registrados:</span> {selectedRule._count?.redeemedCodes ?? 0}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Estructura:</span>
                  <pre className="mt-1 bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedRule.structureDef, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-2">Eliminar Regla</h3>
              <p className="text-sm text-gray-600 mb-4">
                Esta accion eliminara la regla y todos sus datos asociados. Esta accion no se puede deshacer.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rules table */}
      {selectedProject && (
        <Card>
          <CardContent>
            {loading ? (
              <p className="text-gray-500 py-4">Cargando...</p>
            ) : rules.length === 0 ? (
              <p className="text-gray-500 py-4">No hay reglas para este proyecto</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Nombre</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">SKU</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Longitud</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Charset</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Algoritmo</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Canjes</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Estado</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 px-2 font-medium">{r.name}</td>
                        <td className="py-3 px-2 text-gray-500 font-mono text-xs">{r.skuReference || '-'}</td>
                        <td className="py-3 px-2">{r.totalLength}</td>
                        <td className="py-3 px-2"><Badge>{r.charset}</Badge></td>
                        <td className="py-3 px-2"><Badge>{r.checkAlgorithm || '-'}</Badge></td>
                        <td className="py-3 px-2">{r._count?.redeemedCodes ?? 0}</td>
                        <td className="py-3 px-2">
                          <Badge variant={r.isActive ? 'success' : 'danger'}>
                            {r.isActive ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => loadRuleDetail(r.id)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">
                              Detalle
                            </button>
                            <button
                              onClick={async () => { const detail = await rulesApi.get(r.id); setSelectedRule(detail); startEditing(detail); }}
                              className="text-blue-600 hover:text-blue-800"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(r.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
