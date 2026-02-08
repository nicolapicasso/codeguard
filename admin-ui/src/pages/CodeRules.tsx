import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Plus } from 'lucide-react';
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
      setLoading(true);
      rulesApi.list(selectedProject).then(setRules).catch(() => setRules([])).finally(() => setLoading(false));
    }
  }, [selectedProject]);

  const handleRuleCreated = async () => {
    setShowBuilder(false);
    if (selectedProject) {
      const updated = await rulesApi.list(selectedProject);
      setRules(updated);
    }
  };

  const loadRuleDetail = async (id: string) => {
    const detail = await rulesApi.get(id);
    setSelectedRule(detail);
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

      {/* Rule detail */}
      {selectedRule && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{selectedRule.name}</h2>
              <button onClick={() => setSelectedRule(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">SKU:</span> {selectedRule.skuReference || '-'}</div>
              <div><span className="text-gray-500">Longitud:</span> {selectedRule.totalLength}</div>
              <div><span className="text-gray-500">Charset:</span> <Badge>{selectedRule.charset}</Badge></div>
              <div><span className="text-gray-500">Algoritmo:</span> <Badge>{selectedRule.checkAlgorithm || 'Ninguno'}</Badge></div>
              <div><span className="text-gray-500">Separador:</span> {selectedRule.separator || 'Ninguno'}</div>
              <div><span className="text-gray-500">Prefijo:</span> {selectedRule.prefix || 'Ninguno'}</div>
              <div><span className="text-gray-500">Max canjes:</span> {selectedRule.maxRedemptions}</div>
              <div><span className="text-gray-500">Puntos:</span> {selectedRule.pointsValue || '-'}</div>
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
          </CardContent>
        </Card>
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
                          <button onClick={() => loadRuleDetail(r.id)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">
                            Detalle
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
