import { useEffect, useRef, type JSX } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoCollection, Theme } from "../types";
import { formatPct, formatPop } from "../lib/format";

const CONUS: [number, number] = [-97.4, 38.6];
const EMPTY: GeoCollection = { type: "FeatureCollection", features: [] };

const RATE_COLOR: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "current_antidepressant_pct"], 0],
  7.9,
  "#134e4a",
  12,
  "#1d6b63",
  16.6,
  "#d4a017",
  22,
  "#c2410c",
  26.1,
  "#9f1239",
];

const CITY_COLOR: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "proxy_midpoint"], 0],
  7.9,
  "#134e4a",
  12,
  "#1d6b63",
  16.6,
  "#d4a017",
  22,
  "#c2410c",
  26.1,
  "#9f1239",
];

type Props = {
  theme: Theme;
  states: GeoCollection | null;
  cities: GeoCollection | null;
  selectedState: string | null;
  onSelectState: (code: string | null) => void;
  onSelectCity: (payload: { name: string; state: string } | null) => void;
};

export function MapView({
  theme,
  states,
  cities,
  selectedState,
  onSelectState,
  onSelectCity,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const callbacks = useRef({ onSelectState, onSelectCity });
  callbacks.current = { onSelectState, onSelectCity };
  const dataRef = useRef({ states, cities, selectedState });
  dataRef.current = { states, cities, selectedState };

  useEffect(() => {
    if (!containerRef.current) return;
    const style =
      theme === "dark"
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: CONUS,
      zoom: 3.55,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    const popup = new maplibregl.Popup({ closeButton: false, offset: 8 });

    const paint = (): void => {
      if (!map.getSource("states")) {
        map.addSource("states", { type: "geojson", data: dataRef.current.states ?? EMPTY });
        map.addLayer({
          id: "states-fill",
          type: "fill",
          source: "states",
          paint: { "fill-color": RATE_COLOR, "fill-opacity": 0.78 },
        });
        map.addLayer({
          id: "states-line",
          type: "line",
          source: "states",
          paint: {
            "line-color": theme === "dark" ? "#0c1116" : "#f4f1ea",
            "line-width": 0.8,
          },
        });
        map.addLayer({
          id: "states-highlight",
          type: "line",
          source: "states",
          paint: { "line-color": "#f4d58d", "line-width": 2.4 },
          filter: ["==", ["get", "code"], dataRef.current.selectedState ?? ""],
        });
      }
      if (!map.getSource("cities")) {
        map.addSource("cities", { type: "geojson", data: dataRef.current.cities ?? EMPTY });
        map.addLayer({
          id: "cities-circles",
          type: "circle",
          source: "cities",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "population"], 0],
              400000,
              4,
              8500000,
              18,
            ],
            "circle-color": CITY_COLOR,
            "circle-stroke-width": 1.2,
            "circle-stroke-color": theme === "dark" ? "#f4f1ea" : "#0c1116",
            "circle-opacity": 0.92,
          },
        });
      }
    };

    map.on("load", paint);
    map.on("mousemove", "states-fill", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const p = e.features?.[0]?.properties ?? {};
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="map-pop"><strong>${String(p.name ?? "")}</strong><div>${formatPct(p.current_antidepressant_pct)} current AD use</div><div class="muted">lifetime ${formatPct(p.lifetime_antidepressant_pct)}</div></div>`,
        )
        .addTo(map);
    });
    map.on("mouseleave", "states-fill", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", "states-fill", (e) => {
      const code = String(e.features?.[0]?.properties?.code ?? "");
      callbacks.current.onSelectState(code || null);
      callbacks.current.onSelectCity(null);
    });
    map.on("click", "cities-circles", (e) => {
      const p = e.features?.[0]?.properties ?? {};
      callbacks.current.onSelectCity({
        name: String(p.name ?? ""),
        state: String(p.state_code ?? ""),
      });
      callbacks.current.onSelectState(String(p.state_code ?? "") || null);
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="map-pop"><strong>${String(p.name ?? "")}, ${String(p.state_code ?? "")}</strong><div>proxy ${formatPct(p.proxy_pct_low)}–${formatPct(p.proxy_pct_high)}</div><div class="muted">${formatPop(p.population)} · Census 2025</div></div>`,
        )
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("states") || !states) return;
    (map.getSource("states") as maplibregl.GeoJSONSource).setData(states);
  }, [states]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("cities") || !cities) return;
    (map.getSource("cities") as maplibregl.GeoJSONSource).setData(cities);
  }, [cities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("states-highlight")) return;
    map.setFilter("states-highlight", ["==", ["get", "code"], selectedState ?? ""]);
  }, [selectedState]);

  return <div ref={containerRef} className="map-root" aria-label="United States choropleth map" />;
}
