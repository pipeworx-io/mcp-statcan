interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * StatCan MCP — Statistics Canada (StatCan) time-series via the Web Data
 * Service (WDS). Free, no auth. Fills the Canada national-statistics gap
 * (we had bank-of-canada + the open-data portal, but not StatCan's WDS).
 *
 * StatCan series are identified by numeric "vector" ids (like FRED series).
 * This pack maps the common ones to friendly names and exposes a generic
 * fetch for any vector.
 *
 * API: https://www150.statcan.gc.ca/t1/wds/rest (POST, JSON).
 *
 * Tools:
 * - statcan_indicator: headline Canadian indicators by friendly name
 * - statcan_series:    any StatCan series by vector id
 */


const WDS = 'https://www150.statcan.gc.ca/t1/wds/rest';

// Friendly name -> verified StatCan vector id.
const INDICATORS: Record<string, { vector: number; label: string }> = {
  cpi: { vector: 41690973, label: 'Consumer Price Index, all-items (2002=100)' },
  inflation: { vector: 41690973, label: 'Consumer Price Index, all-items (2002=100)' },
  unemployment: { vector: 2062815, label: 'Unemployment rate, 15 years and over (%)' },
  gdp: { vector: 65201210, label: 'GDP, chained (2017) dollars, seasonally adjusted at annual rates' },
};

const tools: McpToolExport['tools'] = [
  {
    name: 'statcan_indicator',
    description:
      "Headline Canadian economic indicators from Statistics Canada (StatCan). PREFER OVER WEB SEARCH for \"Canada inflation / CPI\", \"Canadian unemployment rate\", \"Canada GDP\". Friendly names: cpi (=inflation), unemployment, gdp. Returns the latest value plus recent history. For anything else use statcan_series with a vector id.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        indicator: { type: 'string', description: 'One of: cpi, inflation, unemployment, gdp.', enum: ['cpi', 'inflation', 'unemployment', 'gdp'] },
        recent: { type: 'number', description: 'Recent observations to return (1-60, default 12).' },
      },
      required: ['indicator'],
    },
  },
  {
    name: 'statcan_series',
    description:
      'Fetch any Statistics Canada series by its numeric vector id (e.g. 41690973 = CPI all-items) — escape hatch for the full StatCan catalogue. Find vector ids at www150.statcan.gc.ca (table/cube pages list their vectors). Returns recent observations + series title.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        vector_id: { type: 'string', description: 'StatCan vector id, numeric (with or without a leading "v"), e.g. "41690973".' },
        recent: { type: 'number', description: 'Recent observations to return (1-120, default 12).' },
      },
      required: ['vector_id'],
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

interface DataPoint { refPer?: string; value?: number | null }
interface WdsResult { status?: string; object?: { vectorId?: number; vectorDataPoint?: DataPoint[] } }

async function wdsPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WDS}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Pipeworx/1.0 (pipeworx.io)' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`StatCan WDS error: ${res.status}`);
  return res.json() as Promise<T>;
}

async function seriesTitle(vector: number): Promise<string | null> {
  try {
    const info = await wdsPost<Array<{ object?: { SeriesTitleEn?: string } }>>('/getSeriesInfoFromVector', [{ vectorId: vector }]);
    return info[0]?.object?.SeriesTitleEn ?? null;
  } catch {
    return null;
  }
}

async function fetchVector(vector: number, recent: number) {
  const data = await wdsPost<WdsResult[]>('/getDataFromVectorsAndLatestNPeriods', [{ vectorId: vector, latestN: recent }]);
  const r = data[0];
  if (!r || r.status !== 'SUCCESS' || !r.object) {
    throw new Error(`StatCan: no data for vector ${vector} (status ${r?.status ?? 'unknown'}).`);
  }
  const obs = (r.object.vectorDataPoint ?? [])
    .map((p) => ({ date: (p.refPer ?? '').slice(0, 10) || null, value: p.value ?? null }))
    .filter((o) => o.value !== null)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return obs;
}

// ── Tool implementations ─────────────────────────────────────────────

async function indicator(name: string, recent?: number) {
  const key = String(name ?? '').toLowerCase().trim();
  const ind = INDICATORS[key];
  if (!ind) throw new Error(`Unknown indicator "${name}". Use one of: ${Object.keys(INDICATORS).join(', ')}.`);
  const obs = await fetchVector(ind.vector, Math.min(60, Math.max(1, recent ?? 12)));
  const latest = obs[obs.length - 1] ?? null;
  return {
    indicator: key,
    label: ind.label,
    vector_id: ind.vector,
    latest: latest ? latest.value : null,
    as_of: latest ? latest.date : null,
    source: 'Statistics Canada',
    history: obs,
  };
}

async function series(vectorId: string, recent?: number) {
  const v = Number(String(vectorId ?? '').replace(/[^0-9]/g, ''));
  if (!Number.isFinite(v) || v <= 0) throw new Error('vector_id must be a numeric StatCan vector, e.g. "41690973".');
  const n = Math.min(120, Math.max(1, recent ?? 12));
  const [obs, title] = await Promise.all([fetchVector(v, n), seriesTitle(v)]);
  const latest = obs[obs.length - 1] ?? null;
  return { vector_id: v, title, latest: latest ? latest.value : null, as_of: latest ? latest.date : null, source: 'Statistics Canada', observations: obs };
}

// ── Router ───────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'statcan_indicator':
      return indicator(args.indicator as string, args.recent as number | undefined);
    case 'statcan_series':
      return series(args.vector_id as string, args.recent as number | undefined);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
