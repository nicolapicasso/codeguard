import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { AlertTriangle, Shield, Globe, Users, Wifi, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { tenants as tenantsApi, fraud as fraudApi } from '../lib/api';

type Tab = 'overview' | 'attempts' | 'ips' | 'users' | 'geo';

export function FraudDetection() {
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [days, setDays] = useState(7);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Overview
  const [overview, setOverview] = useState<any>(null);
  // Attempts log
  const [attempts, setAttempts] = useState<any>(null);
  const [attemptFilters, setAttemptFilters] = useState({ status: '', error_code: '', ip_address: '', ow_user_id: '' });
  const [attemptPage, setAttemptPage] = useState(1);
  // Suspicious IPs
  const [suspiciousIps, setSuspiciousIps] = useState<any[]>([]);
  // Suspicious Users
  const [suspiciousUsers, setSuspiciousUsers] = useState<any[]>([]);
  // Geo blocked
  const [geoBlocked, setGeoBlocked] = useState<any>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => { tenantsApi.list().then(setTenantList).catch(() => {}); }, []);

  useEffect(() => {
    loadTab(activeTab);
  }, [selectedTenant, days, activeTab, attemptPage]);

  const loadTab = async (tab: Tab) => {
    setLoading(true);
    try {
      const tid = selectedTenant || undefined;
      switch (tab) {
        case 'overview': {
          const data = await fraudApi.overview(tid, days);
          setOverview(data);
          break;
        }
        case 'attempts': {
          const params: any = { days, page: attemptPage, limit: 30 };
          if (tid) params.tenant_id = tid;
          if (attemptFilters.status) params.status = attemptFilters.status;
          if (attemptFilters.error_code) params.error_code = attemptFilters.error_code;
          if (attemptFilters.ip_address) params.ip_address = attemptFilters.ip_address;
          if (attemptFilters.ow_user_id) params.ow_user_id = attemptFilters.ow_user_id;
          const data = await fraudApi.attempts(params);
          setAttempts(data);
          break;
        }
        case 'ips': {
          const data = await fraudApi.suspiciousIps(tid, days, 5);
          setSuspiciousIps(data);
          break;
        }
        case 'users': {
          const data = await fraudApi.suspiciousUsers(tid, days, 3);
          setSuspiciousUsers(data);
          break;
        }
        case 'geo': {
          const data = await fraudApi.geoBlocked(tid, days);
          setGeoBlocked(data);
          break;
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const searchAttempts = () => {
    setAttemptPage(1);
    loadTab('attempts');
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Resumen', icon: Shield },
    { id: 'attempts', label: 'Intentos', icon: AlertTriangle },
    { id: 'ips', label: 'IPs sospechosas', icon: Wifi },
    { id: 'users', label: 'Usuarios', icon: Users },
    { id: 'geo', label: 'Geo-bloqueos', icon: Globe },
  ];

  const chartData = overview?.by_day ? [...overview.by_day].reverse() : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deteccion de Fraude</h1>
          <p className="text-gray-500 mt-1">Monitoreo de intentos de validacion, IPs y usuarios sospechosos</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
        >
          <option value={1}>24 horas</option>
          <option value={3}>3 dias</option>
          <option value={7}>7 dias</option>
          <option value={14}>14 dias</option>
          <option value={30}>30 dias</option>
        </select>
      </div>

      {/* Tenant filter + Tabs */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="w-full md:w-64">
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Todos los tenants</option>
                {tenantList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="flex gap-1 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-gray-500 mb-4">Cargando...</p>}

      {/* ========== OVERVIEW ========== */}
      {activeTab === 'overview' && overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-2xl font-bold text-gray-900">{overview.total_attempts.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Intentos totales</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-2xl font-bold text-green-600">{overview.success_rate}%</p>
                <p className="text-xs text-gray-500 mt-1">Tasa de exito</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-2xl font-bold text-red-600">{overview.failed_attempts.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Fallidos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-2xl font-bold text-amber-600">{overview.geo_blocked}</p>
                <p className="text-xs text-gray-500 mt-1">Geo-bloqueados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-2xl font-bold text-orange-600">{overview.already_redeemed}</p>
                <p className="text-xs text-gray-500 mt-1">Ya canjeados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-2xl font-bold text-purple-600">{overview.invalid_codes}</p>
                <p className="text-xs text-gray-500 mt-1">Codigos invalidos</p>
              </CardContent>
            </Card>
          </div>

          {chartData.length > 0 && (
            <Card>
              <CardHeader><h2 className="font-semibold">Intentos OK vs KO (ultimos {days} dias)</h2></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} />
                    <Legend />
                    <Bar dataKey="ok" name="OK" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ko" name="KO" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ========== ATTEMPTS LOG ========== */}
      {activeTab === 'attempts' && (
        <>
          <Card className="mb-4">
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <select value={attemptFilters.status} onChange={(e) => setAttemptFilters({ ...attemptFilters, status: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                  <option value="">Estado: Todos</option>
                  <option value="OK">OK</option>
                  <option value="KO">KO</option>
                </select>
                <select value={attemptFilters.error_code} onChange={(e) => setAttemptFilters({ ...attemptFilters, error_code: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                  <option value="">Error: Todos</option>
                  <option value="GEO_BLOCKED">GEO_BLOCKED</option>
                  <option value="ALREADY_REDEEMED">ALREADY_REDEEMED</option>
                  <option value="NO_MATCHING_RULE">NO_MATCHING_RULE</option>
                  <option value="INVALID_CHECK_DIGIT">INVALID_CHECK_DIGIT</option>
                  <option value="INVALID_CODE">INVALID_CODE</option>
                </select>
                <input value={attemptFilters.ip_address} onChange={(e) => setAttemptFilters({ ...attemptFilters, ip_address: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" placeholder="Filtrar por IP" />
                <input value={attemptFilters.ow_user_id} onChange={(e) => setAttemptFilters({ ...attemptFilters, ow_user_id: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" placeholder="Filtrar por usuario" />
                <button onClick={searchAttempts} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 font-medium">
                  Buscar
                </button>
              </div>
            </CardContent>
          </Card>

          {attempts && (
            <Card>
              <CardContent>
                {attempts.data.length === 0 ? (
                  <p className="text-gray-500 py-4 text-center">No hay intentos registrados</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Fecha</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Estado</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Error</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Codigo</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Usuario</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">IP</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Pais</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Ciudad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attempts.data.map((a: any) => (
                            <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2 px-2 text-xs text-gray-500">{new Date(a.created_at).toLocaleString('es-ES')}</td>
                              <td className="py-2 px-2">
                                <Badge variant={a.status === 'OK' ? 'success' : 'danger'}>{a.status}</Badge>
                              </td>
                              <td className="py-2 px-2 text-xs font-mono">{a.error_code || '-'}</td>
                              <td className="py-2 px-2 font-mono text-xs">{a.code.length > 20 ? a.code.substring(0, 20) + '...' : a.code}</td>
                              <td className="py-2 px-2 text-xs">{a.ow_user_id || '-'}</td>
                              <td className="py-2 px-2 font-mono text-xs">{a.ip_address || '-'}</td>
                              <td className="py-2 px-2 text-xs">{a.detected_country || '-'}</td>
                              <td className="py-2 px-2 text-xs">{a.detected_city || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {attempts.total_pages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                        <span className="text-xs text-gray-500">{attempts.total.toLocaleString()} resultados — Pagina {attempts.page} de {attempts.total_pages}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setAttemptPage((p) => Math.max(1, p - 1))} disabled={attemptPage === 1}
                            className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-50">
                            <ChevronLeft className="w-3 h-3" /> Ant
                          </button>
                          <button onClick={() => setAttemptPage((p) => p + 1)} disabled={attemptPage >= attempts.total_pages}
                            className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-50">
                            Sig <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ========== SUSPICIOUS IPS ========== */}
      {activeTab === 'ips' && (
        <Card>
          <CardHeader><h2 className="font-semibold">IPs con alta tasa de fallo</h2></CardHeader>
          <CardContent>
            {suspiciousIps.length === 0 ? (
              <p className="text-gray-500 py-4 text-center">No se detectaron IPs sospechosas</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-500">IP</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">Intentos</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">Fallidos</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">% Fallo</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">Codigos</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Paises</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Ultimo intento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suspiciousIps.map((ip) => (
                      <tr key={ip.ip_address} className={`border-b border-gray-50 hover:bg-gray-50 ${ip.failure_rate >= 80 ? 'bg-red-50' : ip.failure_rate >= 50 ? 'bg-amber-50' : ''}`}>
                        <td className="py-3 px-2 font-mono text-xs font-medium">{ip.ip_address}</td>
                        <td className="py-3 px-2 text-right">{ip.total_attempts}</td>
                        <td className="py-3 px-2 text-right text-red-600 font-medium">{ip.failed_attempts}</td>
                        <td className="py-3 px-2 text-right">
                          <Badge variant={ip.failure_rate >= 80 ? 'danger' : ip.failure_rate >= 50 ? 'warning' : 'default'}>
                            {ip.failure_rate}%
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-right">{ip.distinct_codes}</td>
                        <td className="py-3 px-2">
                          <span className="inline-flex gap-1 flex-wrap">
                            {ip.countries.filter(Boolean).map((c: string) => (
                              <span key={c} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{c}</span>
                            ))}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-500">{new Date(ip.last_attempt).toLocaleString('es-ES')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========== SUSPICIOUS USERS ========== */}
      {activeTab === 'users' && (
        <Card>
          <CardHeader><h2 className="font-semibold">Usuarios con patrones sospechosos</h2></CardHeader>
          <CardContent>
            {suspiciousUsers.length === 0 ? (
              <p className="text-gray-500 py-4 text-center">No se detectaron usuarios sospechosos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Usuario</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">Intentos</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">Fallidos</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">% Fallo</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">Codigos</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">IPs</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Paises</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Ultimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suspiciousUsers.map((u) => (
                      <tr key={u.ow_user_id} className={`border-b border-gray-50 hover:bg-gray-50 ${u.failure_rate >= 80 ? 'bg-red-50' : u.failure_rate >= 50 ? 'bg-amber-50' : ''}`}>
                        <td className="py-3 px-2 font-mono text-xs font-medium">{u.ow_user_id}</td>
                        <td className="py-3 px-2 text-right">{u.total_attempts}</td>
                        <td className="py-3 px-2 text-right text-red-600 font-medium">{u.failed_attempts}</td>
                        <td className="py-3 px-2 text-right">
                          <Badge variant={u.failure_rate >= 80 ? 'danger' : u.failure_rate >= 50 ? 'warning' : 'default'}>
                            {u.failure_rate}%
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-right">{u.distinct_codes}</td>
                        <td className="py-3 px-2 text-right">
                          {u.distinct_ips > 3 ? (
                            <Badge variant="warning">{u.distinct_ips} IPs</Badge>
                          ) : (
                            u.distinct_ips
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <span className="inline-flex gap-1 flex-wrap">
                            {u.countries.filter(Boolean).map((c: string) => (
                              <span key={c} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{c}</span>
                            ))}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-500">{new Date(u.last_attempt).toLocaleString('es-ES')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========== GEO BLOCKED ========== */}
      {activeTab === 'geo' && geoBlocked && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="text-center py-4">
                <p className="text-3xl font-bold text-red-600">{geoBlocked.total_blocked}</p>
                <p className="text-xs text-gray-500 mt-1">Total geo-bloqueados</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By country */}
            {geoBlocked.by_country.length > 0 && (
              <Card>
                <CardHeader><h2 className="font-semibold">Bloqueos por pais</h2></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 font-medium text-gray-500">Pais</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">Bloqueos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geoBlocked.by_country.map((c: any) => (
                        <tr key={c.country} className="border-b border-gray-50">
                          <td className="py-2 px-2 font-medium">{c.country}</td>
                          <td className="py-2 px-2 text-right font-mono text-red-600">{c.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* By day */}
            {geoBlocked.by_day.length > 0 && (
              <Card>
                <CardHeader><h2 className="font-semibold">Bloqueos por dia</h2></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={[...geoBlocked.by_day].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} />
                      <Bar dataKey="count" name="Bloqueos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
