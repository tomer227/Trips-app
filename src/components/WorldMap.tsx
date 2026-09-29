import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { geoContains, geoDistance, geoMercator, geoPath } from 'd3-geo';
import { pointer, select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { countries } from '../data/countries';
import { categoryInfo, type Place } from '../data/places';
import type { RegionId } from '../data/types';

const W = 400;
const H = 480;

type CountryFeature = Feature<Geometry, { name: string }>;

let geometryCache: CountryFeature[] | null = null;

/** The world geometry is ~200KB gzipped, so it is loaded lazily and cached (also offline, by the service worker). */
function useWorldGeometry(): CountryFeature[] | null {
  const [features, setFeatures] = useState(geometryCache);
  useEffect(() => {
    if (geometryCache) return;
    let alive = true;
    import('world-atlas/countries-50m.json').then(({ default: topology }) => {
      const fc = feature(topology, topology.objects.countries) as FeatureCollection<Geometry, { name: string }>;
      geometryCache = fc.features;
      if (alive) setFeatures(geometryCache);
    });
    return () => {
      alive = false;
    };
  }, []);
  return features;
}

const isoToCountry = new Map(countries.map((c) => [c.isoNumeric, c]));

/** Pins closer than this (in screen units of the 400×480 view) merge into a cluster bubble. */
const CLUSTER_RADIUS = 14;

interface Cluster {
  x: number;
  y: number;
  members: Place[];
}

/** Greedy screen-space clustering: cheap enough to rerun on every zoom frame for ~100 pins. */
function clusterPins(points: { place: Place; x: number; y: number }[], k: number, keepApart: Set<string>): Cluster[] {
  const clusters: Cluster[] = [];
  for (const pt of points) {
    const target = keepApart.has(pt.place.id)
      ? undefined
      : clusters.find((c) => !c.members.some((m) => keepApart.has(m.id)) && Math.hypot((c.x - pt.x) * k, (c.y - pt.y) * k) < CLUSTER_RADIUS);
    if (target) {
      const n = target.members.length;
      target.x = (target.x * n + pt.x) / (n + 1);
      target.y = (target.y * n + pt.y) / (n + 1);
      target.members.push(pt.place);
    } else {
      clusters.push({ x: pt.x, y: pt.y, members: [pt.place] });
    }
  }
  return clusters;
}

interface Props {
  region: RegionId;
  places: Place[];
  selectedId: string | null;
  checkInId: string | null;
  onSelect: (place: Place) => void;
  addMode: boolean;
  onAddAt: (lat: number, lng: number, countryId: string | null) => void;
  /** Fly to a point (e.g. a search result or "near me"). A new `nonce` triggers a new flight. */
  focus?: { lat: number; lng: number; k: number; nonce: number } | null;
}

/** What the user currently sees – the basis for "search this area". */
export interface MapViewport {
  lat: number;
  lng: number;
  /** Distance from the centre to the nearest screen edge, in metres */
  radiusM: number;
  k: number;
}

export interface WorldMapHandle {
  getViewport(): MapViewport | null;
}

// Deep enough to see one neighbourhood: at k = 1200 the view spans roughly 2.5 km.
export const MAX_ZOOM = 1200;

const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap({ region, places, selectedId, checkInId, onSelect, addMode, onAddAt, focus }, ref) {
  const features = useWorldGeometry();
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  const regionFeatures = useMemo(
    () => features?.filter((f) => isoToCountry.get(String(f.id))?.region === region) ?? [],
    [features, region],
  );

  const projection = useMemo(() => {
    const p = geoMercator();
    if (regionFeatures.length) p.fitExtent([[16, 16], [W - 16, H - 16]], { type: 'FeatureCollection', features: regionFeatures });
    return p;
  }, [regionFeatures]);

  const shapes = useMemo(() => {
    if (!features) return [];
    const path = geoPath(projection);
    return features.map((f) => {
      const country = isoToCountry.get(String(f.id));
      const inRegion = country?.region === region;
      return {
        id: String(f.id),
        d: path(f) ?? '',
        cls: inRegion ? `land land-${region}` : country ? 'land land-ours' : 'land',
        label: inRegion ? { name: country!.name, at: path.centroid(f) } : null,
      };
    });
  }, [features, projection, region]);

  // Pan & pinch-zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([[-W, -H], [2 * W, 2 * H]])
      .on('zoom', (e) => setTransform(e.transform));
    zoomRef.current = behavior;
    select(svg).call(behavior);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  // New region → reset the view.
  useEffect(() => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  }, [region]);

  // Selecting a place from the list flies to it.
  useEffect(() => {
    const place = places.find((p) => p.id === selectedId);
    const svg = svgRef.current;
    if (!place || !svg || !zoomRef.current) return;
    const xy = projection([place.lng, place.lat]);
    if (!xy) return;
    const k = Math.max(transform.k, 4);
    // Keep the pin in the upper part of the map, since the details sheet covers the bottom.
    const target = zoomIdentity.translate(W / 2 - xy[0] * k, H * 0.35 - xy[1] * k).scale(k);
    select(svg).transition().duration(500).call(zoomRef.current.transform, target);
    // Only react to selection changes, not to every zoom step.
  }, [selectedId, projection]);

  // Explicit fly-to requests from outside (search results, "near me").
  useEffect(() => {
    if (!focus || !svgRef.current || !zoomRef.current) return;
    const xy = projection([focus.lng, focus.lat]);
    if (!xy) return;
    const target = zoomIdentity.translate(W / 2 - xy[0] * focus.k, H * 0.4 - xy[1] * focus.k).scale(focus.k);
    select(svgRef.current).transition().duration(600).call(zoomRef.current.transform, target);
    // Only a new nonce should start a flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, projection]);

  useImperativeHandle(
    ref,
    () => ({
      getViewport() {
        // Screen centre → map coordinates → longitude/latitude.
        const [cx, cy] = transform.invert([W / 2, H / 2]);
        const center = projection.invert?.([cx, cy]);
        if (!center) return null;
        const edgeX = projection.invert?.([cx + W / 2 / transform.k, cy]);
        const edgeY = projection.invert?.([cx, cy + H / 2 / transform.k]);
        if (!edgeX || !edgeY) return null;
        const R = 6_371_000;
        const radiusM = Math.min(geoDistance(center, edgeX), geoDistance(center, edgeY)) * R;
        return { lng: center[0], lat: center[1], radiusM, k: transform.k };
      },
    }),
    [transform, projection],
  );

  const zoomBy = (factor: number) => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, factor);
  };

  const handleMapClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!addMode || !gRef.current || !features) return;
    const [x, y] = pointer(event.nativeEvent, gRef.current);
    const lngLat = projection.invert?.([x, y]);
    if (!lngLat) return;
    const hit = regionFeatures.find((f) => geoContains(f, lngLat));
    onAddAt(lngLat[1], lngLat[0], hit ? (isoToCountry.get(String(hit.id))?.id ?? null) : null);
  };

  const k = transform.k;

  const projected = useMemo(
    () =>
      places.flatMap((place) => {
        const xy = projection([place.lng, place.lat]);
        return xy ? [{ place, x: xy[0], y: xy[1] }] : [];
      }),
    [places, projection],
  );
  const keepApart = new Set([selectedId, checkInId].filter((id): id is string => !!id));
  const clusters = clusterPins(projected, k, keepApart);
  // Draw the selected / checked-in pins last so they sit on top.
  clusters.sort((a, b) => rank(a) - rank(b));
  function rank(c: Cluster) {
    return c.members[0].id === selectedId ? 2 : c.members[0].id === checkInId ? 1 : 0;
  }

  const zoomInto = (c: Cluster) => {
    if (!svgRef.current || !zoomRef.current) return;
    const nk = Math.min(MAX_ZOOM, k * 2.5);
    const target = zoomIdentity.translate(W / 2 - c.x * nk, H / 2 - c.y * nk).scale(nk);
    select(svgRef.current).transition().duration(400).call(zoomRef.current.transform, target);
  };

  return (
    <div className={`map-wrap ${addMode ? 'adding' : ''}`}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="world-map" onClick={handleMapClick} role="img" aria-label="מפת המקומות">
        <defs>
          <pattern id="waves" width="40" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 10 q10 -6 20 0 t20 0" fill="none" className="wave" />
          </pattern>
        </defs>
        <rect width={W} height={H} className="sea" />
        <rect width={W} height={H} fill="url(#waves)" />
        <g ref={gRef} transform={transform.toString()}>
          {shapes.map((s) => (
            <path key={s.id} d={s.d} className={s.cls} strokeWidth={1.2 / k} />
          ))}
          {k < 5 &&
            shapes.map(
              (s) =>
                s.label && (
                  <text key={`l-${s.id}`} x={s.label.at[0]} y={s.label.at[1]} className="country-label" fontSize={11 / k} strokeWidth={3 / k}>
                    {s.label.name}
                  </text>
                ),
            )}
          {clusters.map((c) => {
            if (c.members.length > 1) {
              const cats = new Set(c.members.map((m) => m.category));
              const color = cats.size === 1 ? categoryInfo[c.members[0].category].color : '#334155';
              return (
                <g
                  key={`c-${c.members[0].id}`}
                  className="pin cluster"
                  transform={`translate(${c.x},${c.y}) scale(${1 / k})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    zoomInto(c);
                  }}
                  role="button"
                  aria-label={`${c.members.length} מקומות – לחצו להתקרבות`}
                >
                  <circle r={15} cy={2} className="pin-shadow" />
                  <circle r={15} fill={color} className="pin-body" />
                  <text className="cluster-count" dy="0.35em">
                    {c.members.length}
                  </text>
                </g>
              );
            }
            const p = c.members[0];
            const selected = p.id === selectedId;
            const here = p.id === checkInId;
            const info = categoryInfo[p.category];
            const r = selected ? 15 : 11;
            return (
              <g
                key={p.id}
                className={`pin ${selected ? 'selected' : ''}`}
                transform={`translate(${c.x},${c.y}) scale(${1 / k})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(p);
                }}
                role="button"
                aria-label={p.name}
              >
                {here && <circle r={r + 7} className="pin-here" />}
                <circle r={r} cy={2} className="pin-shadow" />
                <circle r={r} fill={info.color} className={`pin-body ${p.source === 'google' ? 'pin-google' : ''}`} />
                <text className="pin-emoji" fontSize={selected ? 15 : 11} dy="0.35em">
                  {info.emoji}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {!features && <div className="map-loading">🗺️ טוען מפה…</div>}
      <div className="map-controls">
        <button onClick={() => zoomBy(1.8)} aria-label="התקרבות">
          +
        </button>
        <button onClick={() => zoomBy(1 / 1.8)} aria-label="התרחקות">
          −
        </button>
        <button
          onClick={() => svgRef.current && zoomRef.current && select(svgRef.current).transition().call(zoomRef.current.transform, zoomIdentity)}
          aria-label="איפוס תצוגה"
        >
          ⟲
        </button>
      </div>
    </div>
  );
});

export default WorldMap;
