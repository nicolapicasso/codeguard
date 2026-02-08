import { useState } from 'react';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Plus, Trash2, GripVertical, Code } from 'lucide-react';
import { codeRules as rulesApi } from '../lib/api';

interface Segment {
  name: string;
  type: string;
  length: number;
  value?: string;
  min?: number;
  max?: number;
  case?: string;
  format?: string;
  values?: string[];
  algorithm?: string;
  appliesTo?: string[];
}

interface RuleBuilderProps {
  projectId: string;
  onCreated: () => void;
  onCancel: () => void;
}

const SEGMENT_TYPES = ['fixed', 'numeric', 'alpha', 'alphanumeric', 'check', 'date', 'enum'];
const CHARSETS = ['NUMERIC', 'ALPHA_UPPER', 'ALPHA_LOWER', 'ALPHANUMERIC', 'CUSTOM'];
const ALGORITHMS = ['LUHN', 'MOD10', 'MOD11', 'MOD97', 'VERHOEFF', 'DAMM', 'CUSTOM'];

const ALLOWED_SEGMENTS: Record<string, string[]> = {
  NUMERIC:      ['numeric', 'fixed', 'check', 'date'],
  ALPHA_UPPER:  ['alpha', 'fixed', 'enum', 'check'],
  ALPHA_LOWER:  ['alpha', 'fixed', 'enum', 'check'],
  ALPHANUMERIC: SEGMENT_TYPES,
  CUSTOM:       SEGMENT_TYPES,
};

const CUSTOM_FUNCTION_TEMPLATE = `// input: string con los dígitos del payload
// Debe retornar el dígito de control calculado como string
const sum = input.split('').reduce((a, c) => a + parseInt(c), 0);
return String(sum % 10);`;

export function RuleBuilder({ projectId, onCreated, onCancel }: RuleBuilderProps) {
  const [form, setForm] = useState({
    name: '',
    sku_reference: '',
    charset: 'ALPHANUMERIC',
    has_check_digit: true,
    check_algorithm: 'LUHN',
    check_digit_position: 'LAST',
    separator: '',
    case_sensitive: false,
    prefix: '',
    max_redemptions: 1,
    points_value: 0,
  });
  const [segments, setSegments] = useState<Segment[]>([
    { name: 'codigo', type: 'alphanumeric', length: 8 },
  ]);
  const [productInfo, setProductInfo] = useState('{}');
  const [campaignInfo, setCampaignInfo] = useState('{}');
  const [customFunction, setCustomFunction] = useState(CUSTOM_FUNCTION_TEMPLATE);
  const [allowedCountries, setAllowedCountries] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const allowedTypes = ALLOWED_SEGMENTS[form.charset] || SEGMENT_TYPES;
  const defaultSegType = allowedTypes.includes('alphanumeric') ? 'alphanumeric' : allowedTypes[0];

  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);

  const handleCharsetChange = (newCharset: string) => {
    const newAllowed = ALLOWED_SEGMENTS[newCharset] || SEGMENT_TYPES;
    // Reset segments that are incompatible with the new charset
    const updated = segments.map((seg) => {
      if (!newAllowed.includes(seg.type)) {
        const fallback = newAllowed.includes('alphanumeric') ? 'alphanumeric' : newAllowed[0];
        return { ...seg, type: fallback };
      }
      return seg;
    });
    setSegments(updated);
    setForm({ ...form, charset: newCharset });
  };

  const addSegment = () => {
    setSegments([...segments, { name: `segment_${segments.length}`, type: defaultSegType, length: 4 }]);
  };

  const removeSegment = (index: number) => {
    setSegments(segments.filter((_, i) => i !== index));
  };

  const updateSegment = (index: number, field: string, value: unknown) => {
    const updated = [...segments];
    (updated[index] as any)[field] = value;
    setSegments(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let parsedProduct = {};
      let parsedCampaign = {};
      try { parsedProduct = JSON.parse(productInfo); } catch { /* ignore */ }
      try { parsedCampaign = JSON.parse(campaignInfo); } catch { /* ignore */ }

      const structureDef = {
        segments: segments.map((s) => {
          const seg: any = { name: s.name, type: s.type, length: s.length };
          if (s.type === 'fixed') seg.value = s.value || '';
          if (s.type === 'numeric') {
            if (s.min !== undefined) seg.min = s.min;
            if (s.max !== undefined) seg.max = s.max;
          }
          if (s.type === 'alpha') seg.case = s.case || 'both';
          if (s.type === 'date') seg.format = s.format || 'YYYYMMDD';
          if (s.type === 'enum') seg.values = s.values || [];
          if (s.type === 'check') {
            seg.algorithm = s.algorithm || form.check_algorithm.toLowerCase();
            seg.appliesTo = s.appliesTo || segments.filter((x) => x.type !== 'check').map((x) => x.name);
          }
          return seg;
        }),
      };

      const countries = allowedCountries
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2);

      await rulesApi.create(projectId, {
        name: form.name,
        sku_reference: form.sku_reference || undefined,
        total_length: totalLength,
        charset: form.charset,
        has_check_digit: form.has_check_digit,
        check_algorithm: form.has_check_digit ? form.check_algorithm : undefined,
        check_digit_position: form.has_check_digit ? form.check_digit_position : undefined,
        structure_def: structureDef,
        separator: form.separator || undefined,
        case_sensitive: form.case_sensitive,
        prefix: form.prefix || undefined,
        max_redemptions: form.max_redemptions,
        points_value: form.points_value || undefined,
        product_info: parsedProduct,
        campaign_info: parsedCampaign,
        custom_check_function: form.check_algorithm === 'CUSTOM' ? customFunction : undefined,
        allowed_countries: countries.length > 0 ? countries : undefined,
      });

      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error creando regla');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold">Constructor de Regla</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU Referencia</label>
              <input value={form.sku_reference} onChange={(e) => setForm({ ...form, sku_reference: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Charset *</label>
              <select value={form.charset} onChange={(e) => handleCharsetChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                {CHARSETS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Separador</label>
              <input value={form.separator} onChange={(e) => setForm({ ...form, separator: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" placeholder="-" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prefijo</label>
              <input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max canjes</label>
              <input type="number" min={1} value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Puntos</label>
              <input type="number" value={form.points_value} onChange={(e) => setForm({ ...form, points_value: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          {/* Check digit config */}
          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.has_check_digit} onChange={(e) => setForm({ ...form, has_check_digit: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              Digito de control
            </label>
            {form.has_check_digit && (
              <>
                <select value={form.check_algorithm} onChange={(e) => setForm({ ...form, check_algorithm: e.target.value })}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                  {ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={form.check_digit_position} onChange={(e) => setForm({ ...form, check_digit_position: e.target.value })}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                  <option value="LAST">Al final</option>
                  <option value="FIRST">Al inicio</option>
                </select>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.case_sensitive} onChange={(e) => setForm({ ...form, case_sensitive: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              Case sensitive
            </label>
          </div>

          {/* Custom function editor */}
          {form.has_check_digit && form.check_algorithm === 'CUSTOM' && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Code className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-medium text-amber-800">Custom Check Function (JavaScript)</h3>
              </div>
              <p className="text-xs text-amber-600 mb-3">
                La funcion recibe <code className="bg-amber-100 px-1 rounded">input</code> (string con los digitos del payload)
                y debe retornar el digito de control como string. Se ejecuta en sandbox con timeout de 100ms.
              </p>
              <textarea
                value={customFunction}
                onChange={(e) => setCustomFunction(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder="// Tu funcion aqui..."
                spellCheck={false}
              />
            </div>
          )}

          {/* Geo-fencing */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Geo-fencing (paises permitidos, ISO alpha-2)
            </label>
            <input
              value={allowedCountries}
              onChange={(e) => setAllowedCountries(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="ES, MX, AR, CO (vacio = sin restriccion)"
            />
            <p className="text-xs text-gray-400 mt-1">Dejar vacio para permitir todos los paises</p>
          </div>

          {/* Segments builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-700">
                Segmentos <span className="text-gray-400">(longitud total: {totalLength})</span>
              </h3>
              <button type="button" onClick={addSegment}
                className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 font-medium">
                <Plus className="w-4 h-4" /> Agregar segmento
              </button>
            </div>

            <div className="space-y-2">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                  <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input value={seg.name} onChange={(e) => updateSegment(i, 'name', e.target.value)}
                    className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="nombre" />
                  <select value={seg.type} onChange={(e) => updateSegment(i, 'type', e.target.value)}
                    className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm">
                    {allowedTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" min={1} value={seg.length} onChange={(e) => updateSegment(i, 'length', parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="len" />

                  {seg.type === 'fixed' && (
                    <input value={seg.value || ''} onChange={(e) => updateSegment(i, 'value', e.target.value)}
                      className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="valor" />
                  )}
                  {seg.type === 'numeric' && (
                    <>
                      <input type="number" value={seg.min ?? ''} onChange={(e) => updateSegment(i, 'min', e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="min" />
                      <input type="number" value={seg.max ?? ''} onChange={(e) => updateSegment(i, 'max', e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="max" />
                    </>
                  )}
                  {seg.type === 'date' && (
                    <select value={seg.format || 'YYYYMMDD'} onChange={(e) => updateSegment(i, 'format', e.target.value)}
                      className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm">
                      <option value="YYYYMMDD">YYYYMMDD</option>
                      <option value="YYMMDD">YYMMDD</option>
                      <option value="YYDDD">YYDDD</option>
                    </select>
                  )}
                  {seg.type === 'enum' && (
                    <input value={(seg.values || []).join(',')} onChange={(e) => updateSegment(i, 'values', e.target.value.split(','))}
                      className="w-40 px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="A,B,C" />
                  )}

                  <button type="button" onClick={() => removeSegment(i)} className="text-red-400 hover:text-red-600 ml-auto">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Product & Campaign info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Info (JSON)</label>
              <textarea value={productInfo} onChange={(e) => setProductInfo(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Info (JSON)</label>
              <textarea value={campaignInfo} onChange={(e) => setCampaignInfo(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Vista previa structure_def</h3>
            <pre className="text-xs text-gray-600 overflow-x-auto">
              {JSON.stringify({ segments: segments.map((s) => {
                const seg: any = { name: s.name, type: s.type, length: s.length };
                if (s.type === 'fixed') seg.value = s.value;
                if (s.type === 'numeric') { if (s.min !== undefined) seg.min = s.min; if (s.max !== undefined) seg.max = s.max; }
                if (s.type === 'check') { seg.algorithm = (s.algorithm || form.check_algorithm).toLowerCase(); seg.appliesTo = segments.filter(x => x.type !== 'check').map(x => x.name); }
                return seg;
              }) }, null, 2)}
            </pre>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={submitting}
              className="bg-brand-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 font-medium">
              {submitting ? 'Creando...' : 'Crear Regla'}
            </button>
            <button type="button" onClick={onCancel}
              className="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
