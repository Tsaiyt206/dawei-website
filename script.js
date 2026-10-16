const state = {
  activeCaseId: null,
  mapPanX: 0,
  mapPanY: 0,
  dragStartX: 0,
  dragStartY: 0,
  dragOriginX: 0,
  dragOriginY: 0,
  dragTarget: null,
  isMapDragging: false,
  hasMapDragMoved: false,
  leagueActive: false,
  selectedLeagueRegion: null,
  caseMapView: null,
};

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const SAFE_VIEWPORT_SCALE = 0.985;
const MAP_VIEWBOX_WIDTH = 1000;
const MAP_VIEWBOX_HEIGHT = 720;
const MAP_PADDING = 34;
const MAP_BASE_ZOOM = 1.08 / 1.24;
const MAP_LEAGUE_BASE_ZOOM = 1 / 1.24;
const MARKER_SCREEN_SCALE = 0.98;
const MAP_ZOOM_CLICK_FACTOR = 1.1;
const GEOMETRY_SIMPLIFY_TOLERANCE = 0.32;
const LINE_SIMPLIFY_TOLERANCE = 0.18;
const SOUTH_SEA_VIEWBOX_WIDTH = 180;
const SOUTH_SEA_VIEWBOX_HEIGHT = 210;
const SOUTH_SEA_BOUNDS = {
  minLng: 105,
  maxLng: 125,
  minLat: 3,
  maxLat: 26,
};
const DEG_TO_RAD = Math.PI / 180;

let geoProjector = null;
const regionCenters = new Map();
const SVG_NS = "http://www.w3.org/2000/svg";
const caseRegions = new Set(
  window.DAWEI_CASES.flatMap((item) => item.regions || [item.region]),
);
const casesByRegion = new Map();
window.DAWEI_CASES.forEach((item) => {
  (item.regions || [item.region]).forEach((region) => {
    if (!casesByRegion.has(region)) casesByRegion.set(region, item);
  });
});
const leagueCounts = new Map(
  window.DAWEI_LEAGUE.map((item) => [item.region, item.schools]),
);

const stage = document.querySelector("#stage");
const pointsRoot = document.querySelector("#casePoints");
const caseMarkerGuidesRoot = document.querySelector("#caseMarkerGuides");
const casePinsRoot = document.querySelector("#casePins");
const leagueMarkerGuidesRoot = document.querySelector("#leagueMarkerGuides");
const leagueMarkersRoot = document.querySelector("#leagueMarkers");
const listRoot = document.querySelector("#caseList");
const mapCanvas = document.querySelector("#mapCanvas");
const mapContent = document.querySelector("#mapContent");
const mapZoom = document.querySelector("#mapZoom");
const mapZoomOut = document.querySelector("#mapZoomOut");
const mapZoomIn = document.querySelector("#mapZoomIn");
const chinaGeoMap = document.querySelector("#chinaGeoMap");
const southSeaMap = document.querySelector("#southSeaMap");
const leagueToggle = document.querySelector("#leagueToggle");
const leaguePanel = document.querySelector("#leaguePanel");
const leagueCountList = document.querySelector("#leagueCountList");
const leagueSelection = document.querySelector("#leagueSelection");
const leagueVideoButton = document.querySelector("#leagueVideoButton");
const overlay = document.querySelector("#caseOverlay");
const closeButton = document.querySelector("#closeCase");
const video = document.querySelector("#caseVideo");
const videoPlaceholder = document.querySelector("#videoPlaceholder");
const videoCaption = document.querySelector("#videoCaption");
const caseKicker = document.querySelector("#caseKicker");
const caseTitle = document.querySelector("#caseTitle");
const caseDescription = document.querySelector("#caseDescription");
const caseFacts = document.querySelector("#caseFacts");
const coverBlinkTrigger = document.querySelector("#coverBlinkTrigger");
const coverBlinkVideo = document.querySelector("#coverBlinkVideo");

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
}

function appendStop(gradient, offset, color, opacity = "1") {
  gradient.appendChild(
    createSvgElement("stop", {
      offset,
      "stop-color": color,
      "stop-opacity": opacity,
    }),
  );
}

function createLinearGradient(id, stops) {
  const gradient = createSvgElement("linearGradient", {
    id,
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
  });

  stops.forEach((stop) => appendStop(gradient, ...stop));
  return gradient;
}

function createMapFilter(id, { blur, flood, opacity, dx = 0, dy = 0 }) {
  const filter = createSvgElement("filter", {
    id,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "150%",
    "color-interpolation-filters": "sRGB",
  });

  filter.appendChild(
    createSvgElement("feDropShadow", {
      dx,
      dy,
      stdDeviation: blur,
      "flood-color": flood,
      "flood-opacity": opacity,
    }),
  );

  return filter;
}

function createChinaMapDefs() {
  const defs = createSvgElement("defs");

  defs.append(
    createLinearGradient("mapRegionGradient", [
      ["0%", "#ffffff", "0.98"],
      ["48%", "#f5fcff", "0.96"],
      ["100%", "#edf7ff", "0.96"],
    ]),
    createLinearGradient("mapRegionGradientAlt", [
      ["0%", "#ffffff", "0.98"],
      ["50%", "#f8fdff", "0.96"],
      ["100%", "#eef8ff", "0.96"],
    ]),
    createLinearGradient("mapRegionGradientDeep", [
      ["0%", "#ffffff", "0.98"],
      ["54%", "#f4fbff", "0.96"],
      ["100%", "#eaf6ff", "0.96"],
    ]),
    createLinearGradient("mapCaseRegionGradient", [
      ["0%", "#3bc7ed", "0.95"],
      ["46%", "#2c61d8", "0.91"],
      ["100%", "#254db6", "0.93"],
    ]),
    createLinearGradient("mapCaseRegionHoverGradient", [
      ["0%", "#6af6ff", "0.98"],
      ["46%", "#2f91ff", "0.96"],
      ["100%", "#2769ff", "0.98"],
    ]),
    createLinearGradient("mapExtrudeGlassGradient", [
      ["0%", "#d7ffff", "0.54"],
      ["42%", "#63edff", "0.46"],
      ["100%", "#248dff", "0.38"],
    ]),
    createLinearGradient("mapCaseExtrudeGlassGradient", [
      ["0%", "#d0ffff", "0.72"],
      ["42%", "#58efff", "0.64"],
      ["100%", "#1979ff", "0.52"],
    ]),
    createMapFilter("mapTopGlow", {
      blur: "2.4",
      flood: "#5defff",
      opacity: "0.52",
    }),
    createMapFilter("mapExtrudeGlow", {
      blur: "3.6",
      flood: "#3fecff",
      opacity: "0.52",
      dy: "3",
    }),
  );

  return defs;
}

function createSouthSeaMapDefs() {
  const defs = createSvgElement("defs");

  defs.append(
    createLinearGradient("southSeaRegionGradient", [
      ["0%", "#ffffff", "0.96"],
      ["52%", "#f8fdff", "0.94"],
      ["100%", "#eef8ff", "0.94"],
    ]),
    createLinearGradient("southSeaCaseRegionGradient", [
      ["0%", "#45cde9", "0.92"],
      ["52%", "#2f66d6", "0.88"],
      ["100%", "#2853b8", "0.9"],
    ]),
    createMapFilter("southSeaGlow", {
      blur: "1.8",
      flood: "#5defff",
      opacity: "0.46",
    }),
  );

  return defs;
}

function setStageScale() {
  const viewport = window.visualViewport || window;
  const width = viewport.width || window.innerWidth;
  const height = viewport.height || window.innerHeight;
  const scale = Math.min(
    width / BASE_WIDTH,
    height / BASE_HEIGHT,
  ) * SAFE_VIEWPORT_SCALE;

  document.documentElement.style.setProperty("--stage-scale", scale);
}

function walkCoordinates(coordinates, callback) {
  if (typeof coordinates[0] === "number") {
    callback(coordinates);
    return;
  }

  coordinates.forEach((item) => walkCoordinates(item, callback));
}

function mercatorRaw([lng, lat]) {
  const boundedLat = Math.max(Math.min(lat, 85), -85);

  return [
    lng * DEG_TO_RAD,
    -Math.log(Math.tan(Math.PI / 4 + (boundedLat * DEG_TO_RAD) / 2)),
  ];
}

function createProjectorFromRawBounds(bounds, width, height, padding) {
  const scale = Math.min(
    (width - padding * 2) / (bounds.maxX - bounds.minX),
    (height - padding * 2) / (bounds.maxY - bounds.minY),
  );
  const projectedWidth = (bounds.maxX - bounds.minX) * scale;
  const projectedHeight = (bounds.maxY - bounds.minY) * scale;
  const offsetX = (width - projectedWidth) / 2;
  const offsetY = (height - projectedHeight) / 2;

  return (point) => {
    const [rawX, rawY] = mercatorRaw(point);

    return [
      offsetX + (rawX - bounds.minX) * scale,
      offsetY + (rawY - bounds.minY) * scale,
    ];
  };
}

function createProjector(features, width, height, padding) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };

  features.forEach((feature) => {
    if (
      feature.geometry.type !== "Polygon" &&
      feature.geometry.type !== "MultiPolygon"
    ) {
      return;
    }

    walkCoordinates(feature.geometry.coordinates, ([lng, lat]) => {
      const [rawX, rawY] = mercatorRaw([lng, lat]);

      bounds.minX = Math.min(bounds.minX, rawX);
      bounds.maxX = Math.max(bounds.maxX, rawX);
      bounds.minY = Math.min(bounds.minY, rawY);
      bounds.maxY = Math.max(bounds.maxY, rawY);
    });
  });

  return createProjectorFromRawBounds(bounds, width, height, padding);
}

function createProjectorFromLngLatBounds(bounds, width, height, padding) {
  const topLeft = mercatorRaw([bounds.minLng, bounds.maxLat]);
  const bottomRight = mercatorRaw([bounds.maxLng, bounds.minLat]);

  return createProjectorFromRawBounds(
    {
      minX: topLeft[0],
      maxX: bottomRight[0],
      minY: topLeft[1],
      maxY: bottomRight[1],
    },
    width,
    height,
    padding,
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setMapZoom(value) {
  const minZoom = Number(mapZoom.min);
  const maxZoom = Number(mapZoom.max);
  const zoomValue = clamp(Number(value), minZoom, maxZoom);
  const visualZoom =
    zoomValue * (state.leagueActive ? MAP_LEAGUE_BASE_ZOOM : MAP_BASE_ZOOM);
  const markerScale = MARKER_SCREEN_SCALE / visualZoom;

  mapZoom.value = zoomValue.toFixed(2);
  mapContent.style.setProperty("--map-visual-zoom", visualZoom);
  mapContent.style.setProperty("--marker-scale", markerScale);
  mapContent.style.setProperty("--marker-hover-scale", markerScale * 1.08);
}

function stepMapZoom(direction) {
  const currentValue = Number(mapZoom.value);
  const nextValue =
    direction > 0
      ? currentValue * MAP_ZOOM_CLICK_FACTOR
      : currentValue / MAP_ZOOM_CLICK_FACTOR;

  setMapZoom(nextValue);
}

function setMapPan(x, y) {
  state.mapPanX = x;
  state.mapPanY = y;
  mapContent.style.setProperty("--map-pan-x", `${x}px`);
  mapContent.style.setProperty("--map-pan-y", `${y}px`);
}

function beginMapDrag(event) {
  if (
    event.target.closest(".map-zoom-control") ||
    event.target.closest(".case-point, .case-pin, .league-marker") ||
    event.button !== 0
  ) {
    return;
  }

  state.isMapDragging = true;
  state.hasMapDragMoved = false;
  state.dragStartX = event.clientX;
  state.dragStartY = event.clientY;
  state.dragOriginX = state.mapPanX;
  state.dragOriginY = state.mapPanY;
  state.dragTarget = event.target;
  mapCanvas.classList.add("is-dragging");
  state.dragTarget.setPointerCapture(event.pointerId);
}

function dragMap(event) {
  if (!state.isMapDragging) return;

  if (
    Math.abs(event.clientX - state.dragStartX) > 4 ||
    Math.abs(event.clientY - state.dragStartY) > 4
  ) {
    state.hasMapDragMoved = true;
  }

  setMapPan(
    state.dragOriginX + event.clientX - state.dragStartX,
    state.dragOriginY + event.clientY - state.dragStartY,
  );
}

function endMapDrag(event) {
  if (!state.isMapDragging) return;

  state.isMapDragging = false;
  mapCanvas.classList.remove("is-dragging");

  if (state.dragTarget?.hasPointerCapture(event.pointerId)) {
    state.dragTarget.releasePointerCapture(event.pointerId);
  }
  state.dragTarget = null;
}

function distanceToSegmentSquared(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  if (dx === 0 && dy === 0) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  const projectedX = start[0] + t * dx;
  const projectedY = start[1] + t * dy;

  return (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;
}

function simplifyProjectedPoints(points, tolerance) {
  if (points.length <= 3) return points;

  const toleranceSquared = tolerance ** 2;
  let maxDistance = 0;
  let splitIndex = 0;
  const lastIndex = points.length - 1;

  for (let index = 1; index < lastIndex; index += 1) {
    const distance = distanceToSegmentSquared(
      points[index],
      points[0],
      points[lastIndex],
    );

    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }

  if (maxDistance <= toleranceSquared) {
    return [points[0], points[lastIndex]];
  }

  return [
    ...simplifyProjectedPoints(points.slice(0, splitIndex + 1), tolerance).slice(
      0,
      -1,
    ),
    ...simplifyProjectedPoints(points.slice(splitIndex), tolerance),
  ];
}

function pointsToPath(points, projector, { closed = false, tolerance = 0 } = {}) {
  const projectedPoints = points.map((point) => projector(point));
  const isDuplicateClosingPoint =
    closed &&
    projectedPoints.length > 1 &&
    projectedPoints[0][0] === projectedPoints[projectedPoints.length - 1][0] &&
    projectedPoints[0][1] === projectedPoints[projectedPoints.length - 1][1];
  const normalizedPoints = isDuplicateClosingPoint
    ? projectedPoints.slice(0, -1)
    : projectedPoints;
  const simplifiedPoints =
    tolerance > 0
      ? simplifyProjectedPoints(normalizedPoints, tolerance)
      : normalizedPoints;
  const usablePoints =
    closed && simplifiedPoints.length < 3 ? normalizedPoints : simplifiedPoints;

  return usablePoints
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

function polygonToPath(rings, projector = geoProjector) {
  return rings
    .map(
      (ring) =>
        `${pointsToPath(ring, projector, {
          closed: true,
          tolerance: GEOMETRY_SIMPLIFY_TOLERANCE,
        })}Z`,
    )
    .join(" ");
}

function geometryToPath(geometry, projector = geoProjector) {
  if (geometry.type === "Polygon") {
    return polygonToPath(geometry.coordinates, projector);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) => polygonToPath(polygon, projector))
      .join(" ");
  }

  if (geometry.type === "LineString") {
    return pointsToPath(geometry.coordinates, projector, {
      tolerance: LINE_SIMPLIFY_TOLERANCE,
    });
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates
      .map((line) =>
        pointsToPath(line, projector, {
          tolerance: LINE_SIMPLIFY_TOLERANCE,
        }),
      )
      .join(" ");
  }

  return "";
}

function ringAreaAndCenter(ring) {
  const points = ring.map((point) => geoProjector(point));
  let area = 0;
  let centerX = 0;
  let centerY = 0;

  points.forEach(([x1, y1], index) => {
    const [x2, y2] = points[(index + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;

    area += cross;
    centerX += (x1 + x2) * cross;
    centerY += (y1 + y2) * cross;
  });

  area /= 2;

  if (Math.abs(area) < 0.001) {
    return { area: 0, center: points[0] };
  }

  return {
    area: Math.abs(area),
    center: [centerX / (6 * area), centerY / (6 * area)],
  };
}

function featureVisualCenter(feature) {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  let best = null;

  polygons.forEach((polygon) => {
    const result = ringAreaAndCenter(polygon[0]);

    if (!best || result.area > best.area) {
      best = result;
    }
  });

  return best?.center || null;
}

function featureIntersectsBounds(feature, bounds) {
  let intersects = false;

  walkCoordinates(feature.geometry.coordinates, ([lng, lat]) => {
    if (
      lng >= bounds.minLng &&
      lng <= bounds.maxLng &&
      lat >= bounds.minLat &&
      lat <= bounds.maxLat
    ) {
      intersects = true;
    }
  });

  return intersects;
}

function setCasePointPosition(button, item) {
  if (item.geo && geoProjector) {
    const [x, y] = geoProjector(item.geo);
    const [offsetX, offsetY] = item.markerOffset || [0, 0];
    button.style.setProperty("--x", `${((x + offsetX) / MAP_VIEWBOX_WIDTH) * 100}%`);
    button.style.setProperty("--y", `${((y + offsetY) / MAP_VIEWBOX_HEIGHT) * 100}%`);
    return;
  }

  if (regionCenters.has(item.region)) {
    const [x, y] = regionCenters.get(item.region);
    button.style.setProperty("--x", `${(x / MAP_VIEWBOX_WIDTH) * 100}%`);
    button.style.setProperty("--y", `${(y / MAP_VIEWBOX_HEIGHT) * 100}%`);
  }
}

function getMapRegionClass(feature, baseClass) {
  const regionName = feature.properties.name || "";
  const classes = [baseClass];
  if (caseRegions.has(regionName)) classes.push("is-case-region");
  if (leagueCounts.has(regionName)) classes.push("is-league-region");
  return classes.join(" ");
}

function getCaseByRegion(regionName) {
  return casesByRegion.get(regionName) || null;
}

function setRegionActive(regionName, isActive) {
  if (!regionName) return;

  chinaGeoMap
    .querySelectorAll("[data-name]")
    .forEach((element) => {
      if (element.dataset.name === regionName) {
        element.classList.toggle("is-region-active", isActive);
      }
    });
  leagueMarkerGuidesRoot.querySelectorAll("[data-region]").forEach((element) => {
    if (element.dataset.region === regionName) {
      element.classList.toggle("is-region-active", isActive);
    }
  });
}

function setCaseRegionsActive(item, isActive) {
  (item.regions || [item.region]).forEach((region) => {
    setRegionActive(region, isActive);
  });
}

function openRegionCase(regionName) {
  const item = getCaseByRegion(regionName);

  if (item) {
    openCase(item.id);
  }
}

function setLeagueSelection(regionName) {
  state.selectedLeagueRegion = regionName;
  leagueSelection.textContent = regionName
    ? `${regionName} · ${leagueCounts.get(regionName)} 所学校`
    : "全国学校分布";

  chinaGeoMap.querySelectorAll("[data-name]").forEach((element) => {
    element.classList.toggle("is-league-selected", element.dataset.name === regionName);
  });
  leagueCountList.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.region === regionName);
    button.setAttribute("aria-pressed", String(button.dataset.region === regionName));
  });
  leagueMarkersRoot.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.region === regionName);
    button.setAttribute("aria-pressed", String(button.dataset.region === regionName));
  });
  leagueMarkerGuidesRoot.querySelectorAll("[data-region]").forEach((element) => {
    element.classList.toggle("is-selected", element.dataset.region === regionName);
  });
}

function updateRegionAccessibility() {
  chinaGeoMap.querySelectorAll(".map-region[data-name]").forEach((path) => {
    const regionName = path.dataset.name;
    const item = getCaseByRegion(regionName);
    const schools = leagueCounts.get(regionName);
    const actionable = state.leagueActive ? schools !== undefined : Boolean(item);

    path.classList.toggle("is-clickable-region", actionable);
    path.setAttribute("tabindex", actionable ? "0" : "-1");
    if (actionable) {
      path.setAttribute(
        "aria-label",
        state.leagueActive
          ? `${regionName}，${schools}所学校`
          : `查看${item.region}${item.title}`,
      );
    } else {
      path.removeAttribute("aria-label");
    }
  });
}

function setLeagueMode(active) {
  if (active) {
    state.caseMapView = {
      zoom: Number(mapZoom.value),
      panX: state.mapPanX,
      panY: state.mapPanY,
    };
  }

  state.leagueActive = active;
  stage.classList.toggle("is-league-mode", active);
  leaguePanel.hidden = !active;
  leagueToggle.setAttribute("aria-pressed", String(active));
  setLeagueSelection(null);
  updateRegionAccessibility();

  if (active) {
    setMapPan(0, 0);
    setMapZoom(1.24);
  } else if (state.caseMapView) {
    setMapPan(state.caseMapView.panX, state.caseMapView.panY);
    setMapZoom(state.caseMapView.zoom);
  }
}

function renderLeagueCounts() {
  window.DAWEI_LEAGUE.forEach(({ region, schools }) => {
    const button = document.createElement("button");
    const name = document.createElement("span");
    const count = document.createElement("strong");

    button.type = "button";
    button.dataset.region = region;
    button.setAttribute("aria-label", `${region}，${schools}所学校`);
    button.setAttribute("aria-pressed", "false");
    name.textContent = region;
    count.textContent = `${schools} 所`;
    button.append(name, count);
    button.addEventListener("pointerenter", () => setRegionActive(region, true));
    button.addEventListener("pointerleave", () => setRegionActive(region, false));
    button.addEventListener("focus", () => setRegionActive(region, true));
    button.addEventListener("blur", () => setRegionActive(region, false));
    button.addEventListener("click", () => setLeagueSelection(region));
    leagueCountList.appendChild(button);
  });
}

function renderLeagueMarkers() {
  leagueMarkersRoot.replaceChildren();
  leagueMarkerGuidesRoot.replaceChildren();
  if (!geoProjector) return;

  window.DAWEI_LEAGUE.forEach(({ region, schools, geo, offset = [0, 0] }) => {
    const [x, y] = geoProjector(geo);
    const guide = createSvgElement("g", {
      class: "league-marker-guide",
      "data-region": region,
    });
    guide.appendChild(createSvgElement("line", {
      x1: x, y1: y,
      x2: x + offset[0], y2: y + offset[1],
    }));
    guide.appendChild(createSvgElement("circle", { cx: x, cy: y, r: 4 }));
    leagueMarkerGuidesRoot.appendChild(guide);

    const button = document.createElement("button");

    button.type = "button";
    button.className = "league-marker";
    button.dataset.region = region;
    button.setAttribute("aria-label", `${region}，${schools}所学校`);
    button.setAttribute("aria-pressed", "false");
    button.style.setProperty("--anchor-x", `${(x / MAP_VIEWBOX_WIDTH) * 100}%`);
    button.style.setProperty("--anchor-y", `${(y / MAP_VIEWBOX_HEIGHT) * 100}%`);
    button.style.setProperty("--x", `${((x + offset[0]) / MAP_VIEWBOX_WIDTH) * 100}%`);
    button.style.setProperty("--y", `${((y + offset[1]) / MAP_VIEWBOX_HEIGHT) * 100}%`);
    button.textContent = region;
    button.addEventListener("pointerenter", () => setRegionActive(region, true));
    button.addEventListener("pointerleave", () => setRegionActive(region, false));
    button.addEventListener("focus", () => setRegionActive(region, true));
    button.addEventListener("blur", () => setRegionActive(region, false));
    button.addEventListener("click", () => setLeagueSelection(region));
    leagueMarkersRoot.appendChild(button);
  });
}

function addRegionInteractivity(path, regionName) {
  const item = getCaseByRegion(regionName);
  const schools = leagueCounts.get(regionName);
  if (!item && schools === undefined) return;

  path.setAttribute("role", "button");
  path.addEventListener("pointerenter", () => {
    if (state.leagueActive ? schools !== undefined : item) setRegionActive(regionName, true);
  });
  path.addEventListener("pointerleave", () => setRegionActive(regionName, false));
  path.addEventListener("focus", () => {
    if (state.leagueActive ? schools !== undefined : item) setRegionActive(regionName, true);
  });
  path.addEventListener("blur", () => setRegionActive(regionName, false));
  path.addEventListener("click", () => {
    if (state.hasMapDragMoved) return;
    if (state.leagueActive && schools !== undefined) setLeagueSelection(regionName);
    else if (!state.leagueActive) openRegionCase(regionName);
  });
  path.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (state.leagueActive && schools !== undefined) setLeagueSelection(regionName);
      else if (!state.leagueActive) openRegionCase(regionName);
    }
  });
}

function bindCaseMarkerInteraction(button, item) {
  button.addEventListener("pointerenter", () => setCaseRegionsActive(item, true));
  button.addEventListener("pointerleave", () => setCaseRegionsActive(item, false));
  button.addEventListener("focus", () => setCaseRegionsActive(item, true));
  button.addEventListener("blur", () => setCaseRegionsActive(item, false));
  button.addEventListener("click", () => openCase(item.id));
}

function createCaseButton(item, className) {
  const button = document.createElement("button");
  const title = document.createElement("strong");
  const subtitle = document.createElement("span");

  button.type = "button";
  button.className = className;
  button.dataset.caseId = item.id;
  button.setAttribute("aria-label", `查看${item.location}：${item.title}`);

  title.textContent = `${item.number} ${item.location}`;
  subtitle.textContent = item.shortTitle;
  button.append(title, subtitle);

  if (className === "case-point") {
    setCasePointPosition(button, item);
  }

  bindCaseMarkerInteraction(button, item);
  return button;
}

function renderCaseAnchors(item) {
  if (!geoProjector || !item.geo) return;

  const [baseX, baseY] = geoProjector(item.geo);
  const [offsetX, offsetY] = item.markerOffset || [0, 0];
  const anchors = item.mapAnchors || [{ region: item.location, geo: item.geo }];

  anchors.forEach(({ region, geo, pinAngle = item.pinAngle || 0 }) => {
    const [x, y] = geoProjector(geo);
    const guideCoordinates = {
      x1: x, y1: y,
      x2: baseX + offsetX, y2: baseY + offsetY,
      "data-case-id": item.id,
    };
    caseMarkerGuidesRoot.append(
      createSvgElement("line", { ...guideCoordinates, class: "case-guide" }),
      createSvgElement("circle", {
        cx: x, cy: y, r: 2,
        class: "case-pin-anchor",
        "data-case-id": item.id,
      }),
    );

    const pin = document.createElement("button");
    const icon = createSvgElement("svg", { viewBox: "0 0 24 32", "aria-hidden": "true" });
    icon.appendChild(createSvgElement("path", {
      d: "M12 1a10 10 0 0 0-10 10c0 7.8 10 21 10 21s10-13.2 10-21A10 10 0 0 0 12 1Z",
    }));
    icon.appendChild(createSvgElement("circle", { cx: 12, cy: 11, r: 3.5 }));
    pin.type = "button";
    pin.className = "case-pin";
    pin.dataset.caseId = item.id;
    pin.setAttribute("aria-label", `查看${region}：${item.title}`);
    pin.style.setProperty("--x", `${(x / MAP_VIEWBOX_WIDTH) * 100}%`);
    pin.style.setProperty("--y", `${(y / MAP_VIEWBOX_HEIGHT) * 100}%`);
    pin.style.setProperty("--pin-angle", `${pinAngle}deg`);
    pin.appendChild(icon);
    bindCaseMarkerInteraction(pin, item);
    casePinsRoot.appendChild(pin);
  });
}

function renderCases() {
  pointsRoot.innerHTML = "";
  listRoot.innerHTML = "";
  caseMarkerGuidesRoot.replaceChildren();
  casePinsRoot.replaceChildren();

  window.DAWEI_CASES.forEach((item) => {
    renderCaseAnchors(item);
    pointsRoot.appendChild(createCaseButton(item, "case-point"));
    listRoot.appendChild(createCaseButton(item, "case-list-item"));
  });
}

async function loadChinaMap() {
  try {
    const response = await fetch("./assets/data/china.geojson");

    if (!response.ok) {
      throw new Error(`Map request failed: ${response.status}`);
    }

    const geojson = await response.json();
    const polygonFeatures = geojson.features.filter(
      (feature) =>
        feature.geometry.type === "Polygon" ||
        feature.geometry.type === "MultiPolygon",
    );
    const southSeaProjector = createProjectorFromLngLatBounds(
      SOUTH_SEA_BOUNDS,
      SOUTH_SEA_VIEWBOX_WIDTH,
      SOUTH_SEA_VIEWBOX_HEIGHT,
      8,
    );

    geoProjector = createProjector(
      polygonFeatures,
      MAP_VIEWBOX_WIDTH,
      MAP_VIEWBOX_HEIGHT,
      MAP_PADDING,
    );
    chinaGeoMap.innerHTML = "";
    southSeaMap.innerHTML = "";
    regionCenters.clear();
    chinaGeoMap.appendChild(createChinaMapDefs());
    southSeaMap.appendChild(createSouthSeaMapDefs());

    const extrusionGroup = createSvgElement("g", {
      class: "map-extrusion-layer",
      "aria-hidden": "true",
    });
    const regionGroup = createSvgElement("g", {
      class: "map-region-layer",
    });
    const boundaryGroup = createSvgElement("g", {
      class: "map-boundary-layer",
      "aria-hidden": "true",
    });

    chinaGeoMap.append(extrusionGroup, regionGroup, boundaryGroup);

    geojson.features.forEach((feature) => {
      const isBoundaryLine =
        feature.geometry.type === "LineString" ||
        feature.geometry.type === "MultiLineString";

      if (!isBoundaryLine) {
        const center = featureVisualCenter(feature);

        if (center) {
          regionCenters.set(feature.properties.name, center);
        }
      }

      const pathData = geometryToPath(feature.geometry);
      const path = createSvgElement("path", {
        d: pathData,
        class: isBoundaryLine
          ? "map-boundary-line"
          : getMapRegionClass(feature, "map-region"),
        "data-name": feature.properties.name || "",
      });
      const regionName = feature.properties.name || "";

      if (isBoundaryLine) {
        boundaryGroup.appendChild(path);
      } else {
        addRegionInteractivity(path, regionName);

        for (let depth = 4; depth >= 1; depth -= 1) {
          extrusionGroup.appendChild(
            createSvgElement("path", {
              d: pathData,
              class: getMapRegionClass(
                feature,
                `map-region-extrusion map-depth-${depth}`,
              ),
              "data-name": feature.properties.name || "",
            }),
          );
        }

        for (let ridge = 3; ridge >= 1; ridge -= 1) {
          extrusionGroup.appendChild(
            createSvgElement("path", {
              d: pathData,
              class: getMapRegionClass(
                feature,
                `map-region-ridge map-ridge-${ridge}`,
              ),
              "data-name": feature.properties.name || "",
            }),
          );
        }

        regionGroup.appendChild(path);
      }

      if (isBoundaryLine || featureIntersectsBounds(feature, SOUTH_SEA_BOUNDS)) {
        const insetPath = createSvgElement("path", {
          d: geometryToPath(feature.geometry, southSeaProjector),
          class: isBoundaryLine
            ? "south-sea-line"
            : getMapRegionClass(feature, "south-sea-region"),
        });

        southSeaMap.appendChild(insetPath);
      }
    });
    renderLeagueMarkers();
    updateRegionAccessibility();
  } catch (error) {
    mapCanvas.classList.add("is-map-fallback");
    console.warn(error);
  }
}

function renderFacts(facts) {
  caseFacts.innerHTML = "";

  facts.forEach((fact) => {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");

    term.textContent = fact.label;
    detail.textContent = fact.value;
    wrapper.append(term, detail);
    caseFacts.appendChild(wrapper);
  });
}

function resetVideo() {
  video.pause();
  video.removeAttribute("src");
  video.controls = false;
  video.load();
}

function openCase(id) {
  const item = id === "league"
    ? window.DAWEI_LEAGUE_CASE
    : window.DAWEI_CASES.find((caseItem) => caseItem.id === id);
  if (!item) return;

  state.activeCaseId = id;
  caseKicker.textContent = `${item.location || item.region} / ${item.kicker}`;
  caseTitle.textContent = item.title;
  caseDescription.textContent = item.description;
  videoCaption.textContent = item.videoLabel || item.title;
  renderFacts(item.facts);

  resetVideo();

  if (item.videoSrc) {
    video.src = item.videoSrc;
    video.controls = true;
    videoPlaceholder.classList.add("is-hidden");
  } else {
    videoPlaceholder.classList.remove("is-hidden");
  }

  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  closeButton.focus();
}

function closeCase() {
  state.activeCaseId = null;
  resetVideo();
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
}

closeButton.addEventListener("click", closeCase);

overlay.addEventListener("click", (event) => {
  if (event.target === overlay) {
    closeCase();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && overlay.classList.contains("is-open")) {
    closeCase();
  }
});

let coverBlinkPlaying = false;

coverBlinkTrigger.addEventListener("click", async () => {
  if (coverBlinkPlaying) return;

  coverBlinkPlaying = true;
  coverBlinkVideo.currentTime = 0;
  try {
    await coverBlinkVideo.play();
  } catch {
    coverBlinkPlaying = false;
  }
});

coverBlinkVideo.addEventListener("ended", () => {
  coverBlinkVideo.currentTime = 0;
  coverBlinkPlaying = false;
});

mapZoom.addEventListener("input", (event) => {
  setMapZoom(event.target.value);
});

leagueToggle.addEventListener("click", () => {
  setLeagueMode(!state.leagueActive);
});

leagueVideoButton.addEventListener("click", () => openCase("league"));

mapZoomOut.addEventListener("click", () => {
  stepMapZoom(-1);
});

mapZoomIn.addEventListener("click", () => {
  stepMapZoom(1);
});

mapCanvas.addEventListener("pointerdown", beginMapDrag);
mapCanvas.addEventListener("pointermove", dragMap);
mapCanvas.addEventListener("pointerup", endMapDrag);
mapCanvas.addEventListener("pointercancel", endMapDrag);

window.addEventListener("resize", setStageScale);
window.visualViewport?.addEventListener("resize", setStageScale);
setStageScale();
setMapZoom(mapZoom.value);
setMapPan(0, 0);

renderLeagueCounts();
loadChinaMap().finally(renderCases);
