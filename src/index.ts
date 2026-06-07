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
 * N2YO MCP — wraps the N2YO Satellite Tracking REST API (n2yo.com)
 *
 * Satellite tracking: where is the ISS / a satellite right now, when is a
 * satellite visible overhead (visual passes), and what satellites are above a
 * given location on Earth.
 *
 * Tools:
 * - get_positions: live/predicted lat-lon-altitude of a satellite by NORAD id
 * - get_visual_passes: upcoming naked-eye-visible passes over an observer
 * - whats_above: list satellites currently above a location within a radius
 *
 * Dual-key model: pass your own N2YO API key via the optional `_apiKey` arg for
 * higher limits, or omit it to use the shared Pipeworx platform key.
 *
 * Unusual auth/shape: N2YO puts request params IN THE PATH and appends the key
 * as a trailing `&apiKey={key}` query — the path ends with `/` then `&apiKey=`.
 * Common NORAD ids: 25544 = ISS, 20580 = Hubble Space Telescope.
 */


const BASE_URL = 'https://api.n2yo.com/rest/v1/satellite';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_positions',
    description:
      'Track where a satellite is right now (or in the next few seconds): get its live latitude, longitude, altitude, and look-angles (azimuth/elevation) from an observer on Earth. Use this to answer "where is the ISS right now?" (NORAD id 25544) or to locate any satellite by NORAD id. Example: get_positions({ norad_id: 25544, lat: 40.71, lon: -74.0 }).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        norad_id: {
          type: 'number',
          description: 'NORAD catalog id of the satellite, e.g. 25544 for the ISS, 20580 for Hubble.',
        },
        lat: { type: 'number', description: 'Observer latitude in decimal degrees.' },
        lon: { type: 'number', description: 'Observer longitude in decimal degrees.' },
        altitude: { type: 'number', description: 'Observer altitude in meters above sea level (default 0).' },
        seconds: {
          type: 'number',
          description: 'Number of future seconds of positions to predict (default 2, max 300).',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional — your own N2YO API key for higher limits; omit to use the shared Pipeworx key.',
        },
      },
      required: ['norad_id', 'lat', 'lon'],
    },
  },
  {
    name: 'get_visual_passes',
    description:
      'Find when a satellite will be visible to the naked eye overhead from an observer location (visual passes = bright, sunlit passes against a dark sky). Returns start/max/end times, elevation, azimuths, brightness magnitude, and duration. Use this for "when can I see the ISS pass over?" Example: get_visual_passes({ norad_id: 25544, lat: 40.71, lon: -74.0 }).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        norad_id: {
          type: 'number',
          description: 'NORAD catalog id of the satellite, e.g. 25544 for the ISS.',
        },
        lat: { type: 'number', description: 'Observer latitude in decimal degrees.' },
        lon: { type: 'number', description: 'Observer longitude in decimal degrees.' },
        altitude: { type: 'number', description: 'Observer altitude in meters above sea level (default 0).' },
        days: { type: 'number', description: 'Number of days ahead to search for passes (default 5, max 10).' },
        min_visibility: {
          type: 'number',
          description: 'Minimum visible duration in seconds for a pass to be returned (default 300).',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional — your own N2YO API key for higher limits; omit to use the shared Pipeworx key.',
        },
      },
      required: ['norad_id', 'lat', 'lon'],
    },
  },
  {
    name: 'whats_above',
    description:
      'List what satellites are currently above a location on Earth, within a given radius of the observer\'s zenith. Use this to answer "what satellites are overhead right now?" Optionally filter by category (e.g. 52 = Starlink, 18 = amateur radio, 1 = brightest). Example: whats_above({ lat: 40.71, lon: -74.0 }).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number', description: 'Observer latitude in decimal degrees.' },
        lon: { type: 'number', description: 'Observer longitude in decimal degrees.' },
        altitude: { type: 'number', description: 'Observer altitude in meters above sea level (default 0).' },
        radius: {
          type: 'number',
          description: 'Search radius in degrees from the observer zenith (default 70, max 90).',
        },
        category: {
          type: 'number',
          description: 'N2YO category filter: 0 = all (default), 18 = amateur radio, 52 = Starlink, 1 = brightest.',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional — your own N2YO API key for higher limits; omit to use the shared Pipeworx key.',
        },
      },
      required: ['lat', 'lon'],
    },
  },
];

async function n2yoGet(path: string, apiKey: string): Promise<unknown> {
  // N2YO shape: params live in the path; the key is a trailing `&apiKey=` query
  // appended right after the final path segment (which ends in `/`).
  const res = await fetch(`${BASE_URL}${path}&apiKey=${encodeURIComponent(apiKey)}`);
  if (!res.ok) {
    const text = await res.text();
    return { error: res.status, message: text };
  }
  return res.json();
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  if (!apiKey) {
    return { error: 'api_key_required', message: 'No N2YO key available.' };
  }

  switch (name) {
    case 'get_positions':
      return getPositions(args, apiKey);
    case 'get_visual_passes':
      return getVisualPasses(args, apiKey);
    case 'whats_above':
      return whatsAbove(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function getPositions(args: Record<string, unknown>, apiKey: string) {
  const norad = args.norad_id as number;
  const lat = args.lat as number;
  const lon = args.lon as number;
  const altitude = (args.altitude as number | undefined) ?? 0;
  const seconds = (args.seconds as number | undefined) ?? 2;

  const data = (await n2yoGet(
    `/positions/${norad}/${lat}/${lon}/${altitude}/${seconds}/`,
    apiKey,
  )) as
    | {
        info?: { satname?: string; satid?: number };
        positions?: Array<{
          satlatitude: number;
          satlongitude: number;
          sataltitude: number;
          azimuth: number;
          elevation: number;
          timestamp: number;
        }>;
      }
    | { error: unknown; message: unknown };

  if ('error' in data) return data;

  const { info, positions } = data;
  return {
    satellite: info?.satname,
    norad_id: info?.satid,
    positions: (positions || []).map((p) => ({
      lat: p.satlatitude,
      lon: p.satlongitude,
      altitude_km: p.sataltitude,
      azimuth: p.azimuth,
      elevation: p.elevation,
      timestamp: p.timestamp,
    })),
  };
}

async function getVisualPasses(args: Record<string, unknown>, apiKey: string) {
  const norad = args.norad_id as number;
  const lat = args.lat as number;
  const lon = args.lon as number;
  const altitude = (args.altitude as number | undefined) ?? 0;
  const days = (args.days as number | undefined) ?? 5;
  const minVisibility = (args.min_visibility as number | undefined) ?? 300;

  const data = (await n2yoGet(
    `/visualpasses/${norad}/${lat}/${lon}/${altitude}/${days}/${minVisibility}/`,
    apiKey,
  )) as
    | {
        info?: { satname?: string; passescount?: number };
        passes?: Array<{
          startAz: number;
          startUTC: number;
          maxEl: number;
          maxUTC: number;
          endAz: number;
          endUTC: number;
          mag: number;
          duration: number;
        }>;
      }
    | { error: unknown; message: unknown };

  if ('error' in data) return data;

  const { info, passes } = data;
  return {
    satellite: info?.satname,
    passes_count: info?.passescount,
    passes: (passes || []).map((p) => ({
      start_utc: p.startUTC,
      max_utc: p.maxUTC,
      end_utc: p.endUTC,
      max_elevation: p.maxEl,
      start_azimuth: p.startAz,
      end_azimuth: p.endAz,
      magnitude: p.mag,
      duration_s: p.duration,
    })),
  };
}

async function whatsAbove(args: Record<string, unknown>, apiKey: string) {
  const lat = args.lat as number;
  const lon = args.lon as number;
  const altitude = (args.altitude as number | undefined) ?? 0;
  const radius = (args.radius as number | undefined) ?? 70;
  const category = (args.category as number | undefined) ?? 0;

  const data = (await n2yoGet(
    `/above/${lat}/${lon}/${altitude}/${radius}/${category}/`,
    apiKey,
  )) as
    | {
        info?: { satcount?: number };
        above?: Array<{
          satid: number;
          satname: string;
          intDesignator: string;
          launchDate: string;
          satlat: number;
          satlng: number;
          satalt: number;
        }>;
      }
    | { error: unknown; message: unknown };

  if ('error' in data) return data;

  const { info, above } = data;
  return {
    count: info?.satcount,
    satellites: (above || []).map((s) => ({
      norad_id: s.satid,
      name: s.satname,
      launch_date: s.launchDate,
      lat: s.satlat,
      lon: s.satlng,
      altitude_km: s.satalt,
    })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
