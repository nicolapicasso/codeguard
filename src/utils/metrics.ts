import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface MetricCounter {
  value: number;
  labels: Record<string, string>;
}

interface MetricHistogram {
  count: number;
  sum: number;
  labels: Record<string, string>;
}

class MetricsRegistry {
  private counters = new Map<string, MetricCounter[]>();
  private histograms = new Map<string, MetricHistogram[]>();
  private gauges = new Map<string, { value: number; labels: Record<string, string> }[]>();

  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, []);
    }
    const entries = this.counters.get(name)!;
    const key = JSON.stringify(labels);
    const existing = entries.find((e) => JSON.stringify(e.labels) === key);
    if (existing) {
      existing.value += value;
    } else {
      entries.push({ value, labels });
    }
  }

  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    const entries = this.histograms.get(name)!;
    const key = JSON.stringify(labels);
    const existing = entries.find((e) => JSON.stringify(e.labels) === key);
    if (existing) {
      existing.count++;
      existing.sum += value;
    } else {
      entries.push({ count: 1, sum: value, labels });
    }
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, []);
    }
    const entries = this.gauges.get(name)!;
    const key = JSON.stringify(labels);
    const existing = entries.find((e) => JSON.stringify(e.labels) === key);
    if (existing) {
      existing.value = value;
    } else {
      entries.push({ value, labels });
    }
  }

  toPrometheus(): string {
    const lines: string[] = [];

    for (const [name, entries] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const entry of entries) {
        const labelStr = formatLabels(entry.labels);
        lines.push(`${name}${labelStr} ${entry.value}`);
      }
    }

    for (const [name, entries] of this.histograms) {
      lines.push(`# TYPE ${name} summary`);
      for (const entry of entries) {
        const labelStr = formatLabels(entry.labels);
        lines.push(`${name}_count${labelStr} ${entry.count}`);
        lines.push(`${name}_sum${labelStr} ${entry.sum}`);
      }
    }

    for (const [name, entries] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      for (const entry of entries) {
        const labelStr = formatLabels(entry.labels);
        lines.push(`${name}${labelStr} ${entry.value}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const pairs = entries.map(([k, v]) => `${k}="${v}"`).join(',');
  return `{${pairs}}`;
}

export const metrics = new MetricsRegistry();

export function registerMetricsHooks(app: FastifyInstance): void {
  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done) => {
    const route = request.routeOptions?.url || request.url;
    const method = request.method;
    const statusCode = String(reply.statusCode);
    const duration = reply.elapsedTime;

    metrics.incrementCounter('codeguard_http_requests_total', {
      method,
      route,
      status: statusCode,
    });

    metrics.observeHistogram('codeguard_http_request_duration_ms', duration, {
      method,
      route,
    });

    done();
  });
}

export function registerMetricsRoute(app: FastifyInstance): void {
  app.get('/metrics', async (_request, reply) => {
    const uptime = process.uptime();
    const mem = process.memoryUsage();

    metrics.setGauge('codeguard_process_uptime_seconds', uptime);
    metrics.setGauge('codeguard_process_memory_rss_bytes', mem.rss);
    metrics.setGauge('codeguard_process_memory_heap_used_bytes', mem.heapUsed);
    metrics.setGauge('codeguard_process_memory_heap_total_bytes', mem.heapTotal);

    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics.toPrometheus();
  });
}
