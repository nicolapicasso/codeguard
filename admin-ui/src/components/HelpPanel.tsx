import { useState } from 'react';
import { X, ChevronRight, HelpCircle, BookOpen } from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  content: string[];
}

const HELP_SECTIONS: Record<string, HelpSection[]> = {
  '/': [
    {
      id: 'dashboard-overview',
      title: 'Dashboard',
      content: [
        'El dashboard muestra un resumen global del sistema: KPIs principales, actividad de validaciones de los ultimos 30 dias y los tenants mas recientes.',
        'Los KPIs se actualizan en tiempo real cada vez que entras al dashboard.',
      ],
    },
  ],
  '/tenants': [
    {
      id: 'tenants-what',
      title: 'Que es un Tenant',
      content: [
        'Un tenant representa a un cliente de OmniWallet que utiliza el sistema de codigos. Cada tenant tiene su propio API Key y API Secret para autenticarse.',
        'Al crear un tenant, el sistema genera automaticamente las credenciales API. Estas se muestran una sola vez al rotar las claves.',
      ],
    },
    {
      id: 'tenants-create',
      title: 'Como crear un Tenant',
      content: [
        '1. Click en "Nuevo Tenant"',
        '2. Introduce el OW Tenant ID (el identificador unico en OmniWallet)',
        '3. Pon un nombre descriptivo para el cliente',
        '4. (Opcional) Configura un webhook URL para notificaciones',
        '5. (Opcional) Anade paises baneados con codigos ISO alpha-2 (ej: KP, IR)',
      ],
    },
    {
      id: 'tenants-keys',
      title: 'Gestion de API Keys',
      content: [
        'Las API Keys son las credenciales que OmniWallet usa para hacer peticiones al sistema.',
        'IMPORTANTE: Despues de rotar claves, las nuevas se muestran UNA SOLA VEZ. Copialas y compartelas con el equipo de integracion de OmniWallet de forma segura.',
        'Las claves antiguas se invalidan inmediatamente al rotar.',
      ],
    },
    {
      id: 'tenants-detail',
      title: 'Detalle del Tenant',
      content: [
        'Al hacer click en "Detalle" de un tenant, puedes ver sus KPIs: validaciones totales, usuarios unicos, lotes generados y codigos.',
        'El grafico de lineas muestra las validaciones por proyecto en los ultimos 30 dias, lo que permite comparar el rendimiento entre campanas.',
      ],
    },
  ],
  '/projects': [
    {
      id: 'projects-what',
      title: 'Que es un Proyecto',
      content: [
        'Un proyecto agrupa reglas de codigo bajo un mismo acuerdo o campana. Normalmente un proyecto = una campana de marketing o un acuerdo con un fabricante.',
        'Cada proyecto pertenece a un unico tenant y puede tener multiples reglas de codigo.',
      ],
    },
    {
      id: 'projects-dates',
      title: 'Vigencia del Proyecto',
      content: [
        'Las fechas de inicio y fin son opcionales. Si se configuran, los codigos solo seran validos dentro de ese periodo.',
        'Si un codigo se valida fuera de la ventana de vigencia, se rechazara con error PROJECT_EXPIRED.',
      ],
    },
    {
      id: 'projects-detail',
      title: 'Detalle del Proyecto',
      content: [
        'Al hacer click en "Detalle" de un proyecto, veras KPIs especificos, un grafico de validaciones diarias, desglose por regla y distribucion por pais.',
      ],
    },
  ],
  '/code-rules': [
    {
      id: 'rules-what',
      title: 'Que es una Regla de Codigo',
      content: [
        'Una regla define la estructura y formato de un tipo de codigo. Incluye charset, longitud, segmentos, algoritmo de check digit, y opcionalmente HMAC.',
        'Cada codigo que se valida se compara contra las reglas del proyecto hasta encontrar una que coincida en estructura.',
      ],
    },
    {
      id: 'rules-modes',
      title: 'Modos: EXTERNAL vs MANAGED',
      content: [
        'EXTERNAL: El fabricante genera los codigos externamente. OmniCodex solo valida que la estructura, checksum y HMAC sean correctos. Ideal cuando el fabricante ya tiene su propio sistema de generacion.',
        'MANAGED: OmniCodex genera, almacena y valida los codigos. Permite crear lotes y descargar los codigos para enviar al fabricante. Ideal cuando se necesita control total.',
      ],
    },
    {
      id: 'rules-segments',
      title: 'Segmentos del Codigo',
      content: [
        'fixed: Valor fijo (ej: prefijo de campana)',
        'numeric: Digitos aleatorios (0-9)',
        'alpha: Letras aleatorias',
        'alphanumeric: Letras y numeros aleatorios',
        'enum: Valor de una lista predefinida (ej: A, B, C)',
        'date: Fecha en formato configurable (YYYYMMDD, YYMMDD, YYDDD)',
        'check: Digito de control calculado (LUHN, MOD10, MOD11...)',
        'hmac: Segmento de autenticacion HMAC (requiere secreto del fabricante)',
      ],
    },
    {
      id: 'rules-security',
      title: 'Niveles de Seguridad',
      content: [
        'Nivel 0 — OPEN: Sin proteccion. Cualquiera puede generar codigos validos.',
        'Nivel 1 — CONTROLLED: Tiene digito de control o entropia >= 30 bits.',
        'Nivel 2 — AUTHENTICATED: Segmento HMAC + secreto del fabricante. Codigos no falsificables sin la clave.',
        'Nivel 3 — PROTECTED: HMAC >= 8 chars + digito de control + entropia >= 40 bits. Maximo nivel.',
        'Para produccion se recomienda minimo Nivel 2 (AUTHENTICATED).',
      ],
    },
    {
      id: 'rules-fabricant',
      title: 'Que pedir al fabricante',
      content: [
        'Para configurar una regla, necesitas del fabricante:',
        '1. ESTRUCTURA del codigo: longitud total, charset, separadores, prefijos',
        '2. ALGORITMO de check digit: cual usa (LUHN, MOD11, etc.) y posicion (inicio/final)',
        '3. SECRETO HMAC (si aplica): la clave secreta compartida para generar el segmento HMAC',
        '4. FORMATO de segmentos: que significa cada parte del codigo (ej: primeros 4 = fecha, siguientes 8 = aleatorio)',
        'Si el fabricante no tiene un sistema propio, usa modo MANAGED y genera los codigos desde OmniCodex.',
      ],
    },
  ],
  '/batches': [
    {
      id: 'batches-what',
      title: 'Gestion de Lotes',
      content: [
        'Los lotes solo funcionan con reglas en modo MANAGED. Permiten generar grandes cantidades de codigos unicos.',
        'Los codigos se almacenan cifrados y se descargan en formato CSV, JSON o PIN.',
      ],
    },
    {
      id: 'batches-flow',
      title: 'Flujo de generacion',
      content: [
        '1. Ve a Code Rules y busca una regla MANAGED',
        '2. Click en el icono de paquete para generar un lote',
        '3. Configura la cantidad (1.000 a 1.000.000), etiqueta y formato',
        '4. El sistema genera los codigos (puede tardar unos minutos para lotes grandes)',
        '5. Cuando el estado sea COMPLETADO, descarga el fichero',
        '6. Opcionalmente, sella el lote para impedir mas descargas',
      ],
    },
    {
      id: 'batches-states',
      title: 'Estados de un Lote',
      content: [
        'PENDIENTE: En cola, aun no ha empezado la generacion',
        'GENERANDO: En proceso de generacion (se actualiza automaticamente)',
        'COMPLETADO: Todos los codigos generados, listo para descargar',
        'ERROR: Fallo durante la generacion (ver mensaje de error)',
        'CANCELADO: Cancelado manualmente antes de completar',
        'SELLADO: Completado y bloqueado, no se puede descargar mas',
      ],
    },
  ],
  '/tester': [
    {
      id: 'tester-what',
      title: 'Code Tester',
      content: [
        'Herramienta de depuracion para probar codigos contra las reglas configuradas.',
        'Introduce un codigo y selecciona el proyecto para ver si pasa todas las fases de validacion.',
        'Se mantiene un historial de las ultimas 20 pruebas.',
      ],
    },
  ],
  '/stats': [
    {
      id: 'stats-what',
      title: 'Analitica',
      content: [
        'Selecciona un tenant para ver el resumen de todos sus proyectos con un grafico de lineas que compara validaciones entre ellos.',
        'Selecciona un proyecto especifico para ver metricas detalladas: validaciones diarias, desglose por regla y distribucion geografica.',
        'Puedes cambiar el rango temporal (7d a 90d) con el selector superior.',
      ],
    },
  ],
  '/fraud': [
    {
      id: 'fraud-what',
      title: 'Deteccion de Fraude',
      content: [
        'Esta seccion monitoriza TODOS los intentos de validacion (exitosos y fallidos) para detectar patrones sospechosos.',
        'Los datos se registran automaticamente con cada peticion de validacion, incluyendo IP, geolocalizacion (pais, region, ciudad), usuario e informacion del error.',
      ],
    },
    {
      id: 'fraud-tabs',
      title: 'Pestanas disponibles',
      content: [
        'Resumen: KPIs globales con tasa de exito, fallos por tipo, y grafico OK/KO diario.',
        'Intentos: Log completo de todas las peticiones con filtros por estado, error, IP y usuario.',
        'IPs sospechosas: IPs con alta tasa de fallo. Las filas rojas (>80%) indican posible ataque. Las amarillas (>50%) requieren vigilancia.',
        'Usuarios: Usuarios con patrones anomalos — muchos intentos fallidos, multiples IPs, muchos codigos diferentes.',
        'Geo-bloqueos: Resumen de intentos rechazados por restriccion geografica.',
      ],
    },
    {
      id: 'fraud-actions',
      title: 'Que hacer ante fraude',
      content: [
        'Si detectas una IP con >80% de fallos y muchos intentos: probablemente alguien esta intentando adivinar codigos. Puedes anadir su pais a la lista de baneados del tenant.',
        'Si un usuario tiene muchos intentos fallidos con codigos diferentes: posible intento de brute force. Contacta al equipo de OmniWallet para bloquear al usuario.',
        'Los geo-bloqueos frecuentes desde un pais no configurado pueden indicar que falta anadir ese pais a la lista permitida, o que hay un ataque desde esa region.',
      ],
    },
  ],
};

// Fallback help for unknown routes
const DEFAULT_HELP: HelpSection[] = [
  {
    id: 'general',
    title: 'Ayuda General',
    content: [
      'Usa el menu lateral para navegar entre las secciones del backoffice.',
      'Cada seccion tiene su propia guia de ayuda contextual.',
    ],
  },
];

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
}

export function HelpPanel({ isOpen, onClose, currentPath }: HelpPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Match current path to help content
  const basePath = '/' + (currentPath.split('/')[1] || '');
  const sections = HELP_SECTIONS[basePath] || DEFAULT_HELP;

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">Guia de Ayuda</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-60px)] p-5">
          <div className="space-y-2">
            {sections.map((section) => (
              <div key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900">{section.title}</span>
                  <ChevronRight
                    className={`w-4 h-4 text-gray-400 transition-transform ${
                      expandedSection === section.id ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {expandedSection === section.id && (
                  <div className="px-4 pb-4 space-y-2">
                    {section.content.map((text, i) => (
                      <p key={i} className="text-sm text-gray-600 leading-relaxed">
                        {text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Toggle button for the help panel */
export function HelpToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-12 h-12 bg-brand-600 text-white rounded-full shadow-lg hover:bg-brand-700 transition-colors flex items-center justify-center z-30"
      title="Ayuda"
    >
      <HelpCircle className="w-6 h-6" />
    </button>
  );
}
