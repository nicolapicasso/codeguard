import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Play, CheckCircle, XCircle } from 'lucide-react';
import { tenants as tenantsApi, projects as projectsApi, codeRules as rulesApi } from '../lib/api';

export function CodeTester() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [rules, setRules] = useState<any[]>([]);
  const [selectedRule, setSelectedRule] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<Array<{ code: string; result: any; time: string }>>([]);

  useEffect(() => { tenantsApi.list().then(setTenantList).catch(() => {}); }, []);

  useEffect(() => {
    if (selectedTenant) {
      projectsApi.list(selectedTenant).then(setProjectList).catch(() => setProjectList([]));
      setSelectedProject('');
      setRules([]);
      setSelectedRule('');
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (selectedProject) {
      rulesApi.list(selectedProject).then(setRules).catch(() => setRules([]));
      setSelectedRule('');
    }
  }, [selectedProject]);

  const handleTest = async () => {
    if (!selectedRule || !code.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await rulesApi.test(selectedRule, code.trim());
      setResult(res);
      setHistory((prev) => [{ code: code.trim(), result: res, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 19)]);
    } catch (err: any) {
      const body = err.body || { status: 'KO', errorCode: 'ERROR', errorMessage: err.message };
      setResult(body);
      setHistory((prev) => [{ code: code.trim(), result: body, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 19)]);
    } finally {
      setTesting(false);
    }
  };

  const isOk = result?.status === 'OK';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Code Tester</h1>
        <p className="text-gray-500 mt-1">Prueba codigos contra reglas sin registrar canjes (modo debug)</p>
      </div>

      {/* Selectors */}
      <Card className="mb-6">
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
              <select value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                <option value="">-- Tenant --</option>
                {tenantList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto</label>
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} disabled={!selectedTenant}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                <option value="">-- Proyecto --</option>
                {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regla</label>
              <select value={selectedRule} onChange={(e) => setSelectedRule(e.target.value)} disabled={!selectedProject}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                <option value="">-- Regla --</option>
                {rules.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.charset}, len:{r.totalLength})</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Code input */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-lg font-mono focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="Introduce el codigo a probar..."
              disabled={!selectedRule}
            />
            <button
              onClick={handleTest}
              disabled={!selectedRule || !code.trim() || testing}
              className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors font-medium"
            >
              <Play className="w-5 h-5" />
              {testing ? 'Probando...' : 'Probar'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className={`mb-6 border-2 ${isOk ? 'border-brand-200' : 'border-red-200'}`}>
          <CardHeader className={isOk ? 'bg-brand-50' : 'bg-red-50'}>
            <div className="flex items-center gap-2">
              {isOk ? <CheckCircle className="w-5 h-5 text-brand-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <span className={`font-bold ${isOk ? 'text-brand-700' : 'text-red-700'}`}>
                {result.status}
              </span>
              {!isOk && result.error_code && (
                <Badge variant="danger">{result.error_code || result.errorCode}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-gray-700 overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-700">Historial de pruebas</h2></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-3 text-sm py-1 border-b border-gray-50">
                  <span className="text-gray-400 text-xs w-16">{h.time}</span>
                  {h.result.status === 'OK'
                    ? <CheckCircle className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  <code className="font-mono text-gray-700">{h.code}</code>
                  {h.result.status !== 'OK' && (
                    <Badge variant="danger">{h.result.error_code || h.result.errorCode}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
