import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Download, XCircle, Lock, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { tenants as tenantsApi, projects as projectsApi, codeRules as rulesApi, batches as batchesApi } from '../lib/api';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'default',
  GENERATING: 'warning',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'danger',
  SEALED: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  GENERATING: 'Generando...',
  COMPLETED: 'Completado',
  FAILED: 'Error',
  CANCELLED: 'Cancelado',
  SEALED: 'Sellado',
};

export function Batches() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [ruleList, setRuleList] = useState<any[]>([]);
  const [selectedRule, setSelectedRule] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [batchList, setBatchList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    tenantsApi.list().then(setTenantList).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      projectsApi.list(selectedTenant).then(setProjectList).catch(() => setProjectList([]));
      setSelectedProject('');
      setSelectedRule('');
      setRuleList([]);
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (selectedProject) {
      rulesApi.list(selectedProject).then((rules) => {
        setRuleList(rules.filter((r: any) => r.generationMode === 'MANAGED'));
      }).catch(() => setRuleList([]));
      setSelectedRule('');
    }
  }, [selectedProject]);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (selectedRule) params.code_rule_id = selectedRule;
      else if (selectedProject) params.project_id = selectedProject;
      if (statusFilter) params.status = statusFilter;

      const result = await batchesApi.list(params);
      if (Array.isArray(result)) {
        setBatchList(result);
        setTotalPages(1);
      } else {
        setBatchList(result.data || result.batches || []);
        setTotalPages(result.totalPages || result.total_pages || 1);
      }
    } catch {
      setBatchList([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedRule, statusFilter, page]);

  useEffect(() => {
    if (selectedProject) {
      loadBatches();
    }
  }, [selectedProject, selectedRule, statusFilter, page, loadBatches]);

  // Auto-refresh for generating batches
  useEffect(() => {
    const hasGenerating = batchList.some((b) => b.status === 'GENERATING' || b.status === 'PENDING');
    if (!hasGenerating) return;
    const interval = setInterval(loadBatches, 5000);
    return () => clearInterval(interval);
  }, [batchList, loadBatches]);

  const handleDownload = async (batchId: string, format: 'csv' | 'json') => {
    setDownloading(batchId);
    try {
      const res = await batchesApi.download(batchId, format);
      if (!res.ok) throw new Error('Error descargando');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch-${batchId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error descargando lote');
    } finally {
      setDownloading('');
    }
  };

  const handleCancel = async (batchId: string) => {
    if (!confirm('¿Cancelar este lote? Los codigos generados se perderan.')) return;
    setActionLoading(batchId);
    try {
      await batchesApi.cancel(batchId);
      await loadBatches();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error cancelando lote');
    } finally {
      setActionLoading('');
    }
  };

  const handleSeal = async (batchId: string) => {
    if (!confirm('¿Sellar este lote? No se podran descargar mas los codigos.')) return;
    setActionLoading(batchId);
    try {
      await batchesApi.seal(batchId);
      await loadBatches();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error sellando lote');
    } finally {
      setActionLoading('');
    }
  };

  const loadBatchDetail = async (batchId: string) => {
    try {
      const detail = await batchesApi.get(batchId);
      setSelectedBatch(detail);
    } catch {
      alert('Error cargando detalle del lote');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lotes de Codigos</h1>
          <p className="text-gray-500 mt-1">Genera, descarga y gestiona lotes de codigos para reglas MANAGED</p>
        </div>
        {selectedProject && (
          <button
            onClick={loadBatches}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
        )}
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                disabled={!selectedTenant}
              >
                <option value="">-- Seleccionar Proyecto --</option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regla MANAGED</label>
              <select
                value={selectedRule}
                onChange={(e) => setSelectedRule(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                disabled={!selectedProject}
              >
                <option value="">Todas las reglas</option>
                {ruleList.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="GENERATING">Generando</option>
                <option value="COMPLETED">Completado</option>
                <option value="FAILED">Error</option>
                <option value="CANCELLED">Cancelado</option>
                <option value="SEALED">Sellado</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batch detail */}
      {selectedBatch && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Detalle del Lote</h2>
              <button onClick={() => setSelectedBatch(null)} className="text-gray-400 hover:text-gray-600 text-sm">
                Cerrar
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">ID:</span>
                <span className="ml-1 font-mono text-xs">{selectedBatch.batch_id}</span>
              </div>
              <div>
                <span className="text-gray-500">Estado:</span>{' '}
                <Badge variant={STATUS_VARIANT[selectedBatch.status] || 'default'}>
                  {STATUS_LABEL[selectedBatch.status] || selectedBatch.status}
                </Badge>
              </div>
              <div>
                <span className="text-gray-500">Regla:</span> {selectedBatch.code_rule?.name || selectedBatch.code_rule_id}
              </div>
              <div><span className="text-gray-500">Tamano del lote:</span> {selectedBatch.batch_size?.toLocaleString()}</div>
              <div><span className="text-gray-500">Generados:</span> {selectedBatch.generated_count?.toLocaleString()}</div>
              <div><span className="text-gray-500">Formato:</span> {selectedBatch.format || '-'}</div>
              <div><span className="text-gray-500">Etiqueta:</span> {selectedBatch.label || '-'}</div>
              <div><span className="text-gray-500">Creado por:</span> {selectedBatch.created_by || '-'}</div>
              <div><span className="text-gray-500">Descargas:</span> {selectedBatch.download_count || 0}</div>
              <div><span className="text-gray-500">Creado:</span> {new Date(selectedBatch.created_at).toLocaleString()}</div>
              <div><span className="text-gray-500">Completado:</span> {selectedBatch.completed_at ? new Date(selectedBatch.completed_at).toLocaleString() : '-'}</div>
              <div><span className="text-gray-500">Expira:</span> {selectedBatch.expires_at ? new Date(selectedBatch.expires_at).toLocaleDateString() : 'Sin expiracion'}</div>
              {selectedBatch.error_message && (
                <div className="col-span-full">
                  <span className="text-gray-500">Error:</span>
                  <span className="ml-1 text-red-600">{selectedBatch.error_message}</span>
                </div>
              )}
            </div>

            {/* Progress bar for generating batches */}
            {(selectedBatch.status === 'GENERATING' || selectedBatch.status === 'PENDING') && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Progreso</span>
                  <span>{selectedBatch.generated_count?.toLocaleString()} / {selectedBatch.batch_size?.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-brand-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.round(((selectedBatch.generated_count || 0) / (selectedBatch.batch_size || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              {selectedBatch.status === 'COMPLETED' && (
                <>
                  <button
                    onClick={() => handleDownload(selectedBatch.batch_id, 'csv')}
                    disabled={downloading === selectedBatch.batch_id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading === selectedBatch.batch_id ? 'Descargando...' : 'Descargar CSV'}
                  </button>
                  <button
                    onClick={() => handleDownload(selectedBatch.batch_id, 'json')}
                    disabled={downloading === selectedBatch.batch_id}
                    className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </button>
                  <button
                    onClick={() => handleSeal(selectedBatch.batch_id)}
                    disabled={actionLoading === selectedBatch.batch_id}
                    className="flex items-center gap-2 px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg text-sm hover:bg-amber-50 disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Sellar
                  </button>
                </>
              )}
              {(selectedBatch.status === 'PENDING' || selectedBatch.status === 'GENERATING') && (
                <button
                  onClick={() => handleCancel(selectedBatch.batch_id)}
                  disabled={actionLoading === selectedBatch.batch_id}
                  className="flex items-center gap-2 px-3 py-1.5 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batches table */}
      {selectedProject && (
        <Card>
          <CardContent>
            {loading ? (
              <p className="text-gray-500 py-4">Cargando lotes...</p>
            ) : batchList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No hay lotes para estos filtros</p>
                <p className="text-xs text-gray-400 mt-1">Genera un lote desde la seccion Reglas de Codigo en una regla MANAGED</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Etiqueta</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Regla</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Estado</th>
                        <th className="text-right py-3 px-2 font-medium text-gray-500">Codigos</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Formato</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Creado</th>
                        <th className="text-right py-3 px-2 font-medium text-gray-500">Descargas</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchList.map((b) => (
                        <tr key={b.batch_id || b.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-3 px-2 font-medium">{b.label || <span className="text-gray-400">Sin etiqueta</span>}</td>
                          <td className="py-3 px-2 text-xs">{b.code_rule?.name || '-'}</td>
                          <td className="py-3 px-2">
                            <Badge variant={STATUS_VARIANT[b.status] || 'default'}>
                              {STATUS_LABEL[b.status] || b.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-xs">
                            {b.status === 'GENERATING'
                              ? `${(b.generated_count || 0).toLocaleString()} / ${(b.batch_size || 0).toLocaleString()}`
                              : (b.batch_size || 0).toLocaleString()
                            }
                          </td>
                          <td className="py-3 px-2"><Badge>{b.format || '-'}</Badge></td>
                          <td className="py-3 px-2 text-xs text-gray-500">
                            {b.created_at ? new Date(b.created_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="py-3 px-2 text-right">{b.download_count || 0}</td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => loadBatchDetail(b.batch_id || b.id)}
                                className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                              >
                                Detalle
                              </button>
                              {b.status === 'COMPLETED' && (
                                <button
                                  onClick={() => handleDownload(b.batch_id || b.id, 'csv')}
                                  disabled={downloading === (b.batch_id || b.id)}
                                  className="text-green-600 hover:text-green-800"
                                  title="Descargar CSV"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(b.status === 'PENDING' || b.status === 'GENERATING') && (
                                <button
                                  onClick={() => handleCancel(b.batch_id || b.id)}
                                  disabled={actionLoading === (b.batch_id || b.id)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Cancelar"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {b.status === 'COMPLETED' && (
                                <button
                                  onClick={() => handleSeal(b.batch_id || b.id)}
                                  disabled={actionLoading === (b.batch_id || b.id)}
                                  className="text-amber-500 hover:text-amber-700"
                                  title="Sellar"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                    <span className="text-sm text-gray-500">Pagina {page} de {totalPages}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        Siguiente <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
