const leagueScreen = document.querySelector("#leagueScreen");
const leagueBack = document.querySelector("#leagueBack");
const leagueMapViewport = document.querySelector("#leagueMapViewport");
const leagueMapTransform = document.querySelector("#leagueMapTransform");
const leagueMapSvg = document.querySelector("#leagueMapSvg");
const leagueSouthSeaSvg = document.querySelector("#leagueSouthSeaSvg");
const leagueProvinceList = document.querySelector("#leagueProvinces");
const leagueShowcaseVideo = document.querySelector("#leagueShowcaseVideo");
const leagueCaseTrack = document.querySelector("#leagueCaseTrack");
const leagueZoom = document.querySelector("#leagueZoom");
const coveredRegions = new Set(window.DAWEI_LEAGUE.map(({ region }) => region));
const leagueView = { x: 0, y: 0, zoom: 1, pointer: null };
const defaultMapTop = () => stage.querySelector(".main-layout").offsetTop;
let homeScrollY = window.scrollY;

function showLeagueScreen() {
  stage.hidden = true;
  leagueScreen.hidden = false;
  window.scrollTo(0, 0);
}

function showDefaultMap(scrollY = homeScrollY) {
  leagueScreen.hidden = true;
  stage.hidden = false;
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

function routeFromHash() {
  if (location.hash === "#league") return { view: "league" };
  if (location.hash.startsWith("#case/")) {
    const id = decodeURIComponent(location.hash.slice(6));
    if (window.DAWEI_CASES.some((item) => item.id === id)) {
      return { view: "case", id, origin: "home" };
    }
  }
  return { view: "home" };
}

function currentRoute() {
  const fromUrl = routeFromHash();
  const saved = history.state;
  if (saved?.dawei && saved.view === fromUrl.view && saved.id === fromUrl.id) return saved;
  return { dawei: true, ...fromUrl, homeScrollY, inAppBack: false };
}

function rememberHomeScroll() {
  if (leagueScreen.hidden && !overlay.classList.contains("is-open")) {
    homeScrollY = window.scrollY;
    history.replaceState({ ...currentRoute(), homeScrollY }, "", location.href);
  }
}

function renderRoute({ initial = false, focus = false } = {}) {
  const route = currentRoute();
  if (route.view !== "league") leagueShowcaseVideo.pause();
  homeScrollY = Number.isFinite(route.homeScrollY) ? route.homeScrollY : defaultMapTop();
  hideCaseDetails();

  if (route.view === "league") {
    showLeagueScreen();
    if (focus) leagueBack.focus({ preventScroll: true });
  } else if (route.view === "case") {
    if (route.origin === "league") showLeagueScreen();
    else {
      stage.hidden = false;
      leagueScreen.hidden = true;
    }
    showCaseDetails(route.id);
  } else {
    if (initial) {
      stage.hidden = false;
      leagueScreen.hidden = true;
    } else {
      showDefaultMap(homeScrollY);
    }
    if (focus) leagueToggle.focus({ preventScroll: true });
  }
}

function navigateToLeague() {
  if (currentRoute().view === "league") return;
  rememberHomeScroll();
  history.pushState({ dawei: true, view: "league", homeScrollY, inAppBack: true }, "", "#league");
  renderRoute({ focus: true });
}

function navigateToHomeTop() {
  if (currentRoute().view !== "league") return;
  homeScrollY = 0;
  history.pushState({ dawei: true, view: "home", homeScrollY, inAppBack: true }, "", `${location.pathname}${location.search}`);
  renderRoute();
}

function navigateToCase(id) {
  if (!window.DAWEI_CASES.some((item) => item.id === id)) return;
  rememberHomeScroll();
  const origin = leagueScreen.hidden ? "home" : "league";
  history.pushState({ dawei: true, view: "case", id, origin, homeScrollY, inAppBack: true }, "", `#case/${encodeURIComponent(id)}`);
  renderRoute();
}

function navigateBackFromCase() {
  const route = currentRoute();
  if (route.view !== "case") return;
  if (route.inAppBack) {
    history.back();
    return;
  }
  const fallback = route.origin === "league" ? { view: "league" } : { view: "home" };
  history.replaceState({ dawei: true, ...fallback, homeScrollY, inAppBack: false }, "", fallback.view === "league" ? "#league" : `${location.pathname}${location.search}`);
  renderRoute({ focus: true });
}

function navigateBackToHome() {
  const route = currentRoute();
  if (route.view !== "league") return;
  if (route.inAppBack) {
    history.back();
    return;
  }
  history.replaceState({ dawei: true, view: "home", homeScrollY: defaultMapTop(), inAppBack: false }, "", `${location.pathname}${location.search}`);
  renderRoute({ focus: true });
}

function setLeagueZoom(value) {
  leagueView.zoom = clamp(Number(value), 0.8, 3);
  leagueZoom.value = String(leagueView.zoom);
  leagueMapTransform.style.transform = `translate(${leagueView.x}px, ${leagueView.y}px) scale(${leagueView.zoom})`;
}

function setLeaguePan(x, y) {
  leagueView.x = x;
  leagueView.y = y;
  setLeagueZoom(leagueView.zoom);
}

function activateLeagueRegion(region) {
  leagueMapSvg.querySelectorAll("[data-region]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.region === region);
  });
  leagueProvinceList.querySelectorAll("[data-region]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.region === region);
  });
}

function renderLeagueProvinces() {
  leagueProvinceList.replaceChildren();
  window.DAWEI_LEAGUE.forEach(({ region }) => {
    const linkedCase = casesByRegion.get(region);
    const chip = document.createElement(linkedCase ? "button" : "span");
    if (linkedCase) chip.type = "button";
    chip.className = "league-province-chip";
    chip.dataset.region = region;
    chip.textContent = region;
    if (linkedCase) chip.setAttribute("aria-label", `${region}，查看案例${linkedCase.number} ${linkedCase.title}`);
    chip.addEventListener("pointerenter", () => activateLeagueRegion(region));
    chip.addEventListener("pointerleave", () => activateLeagueRegion(null));
    if (linkedCase) {
      chip.addEventListener("focus", () => activateLeagueRegion(region));
      chip.addEventListener("blur", () => activateLeagueRegion(null));
      chip.addEventListener("click", () => openCase(linkedCase.id));
    }
    leagueProvinceList.appendChild(chip);
  });
}

function labelBounds(x, y, width) {
  return { left: x - width / 2, right: x + width / 2, top: y - 12, bottom: y + 12 };
}

function labelOverlaps(a, b) {
  return a.left < b.right + 3 && a.right + 3 > b.left &&
    a.top < b.bottom + 3 && a.bottom + 3 > b.top;
}

function createLeagueLabels(projector) {
  const labels = createSvgElement("g", { class: "league-map-labels" });
  const placed = [];
  const candidates = [
    [0, -25], [0, 25], [36, -10], [-36, -10], [44, 22], [-44, 22],
    [0, -52], [0, 52], [63, -28], [-63, -28], [68, 36], [-68, 36],
  ];

  window.DAWEI_LEAGUE.forEach(({ region, geo, offset = [0, 0] }) => {
    const [pointX, pointY] = projector(geo);
    const width = region.length > 2 ? 58 : 46;
    const positions = [offset, ...candidates];
    let chosen = positions[0];
    let bounds;

    for (const [dx, dy] of positions) {
      const x = clamp(pointX + dx, width / 2 + 8, 1000 - width / 2 - 8);
      const y = clamp(pointY + dy, 15, 705);
      const next = labelBounds(x, y, width);
      if (!placed.some((box) => labelOverlaps(next, box))) {
        chosen = [x - pointX, y - pointY];
        bounds = next;
        break;
      }
    }

    const x = clamp(pointX + chosen[0], width / 2 + 8, 1000 - width / 2 - 8);
    const y = clamp(pointY + chosen[1], 15, 705);
    placed.push(bounds || labelBounds(x, y, width));
    const group = createSvgElement("g", { class: "league-map-label", "data-region": region });
    group.append(
      createSvgElement("line", { x1: pointX, y1: pointY, x2: x, y2: y }),
      createSvgElement("circle", { class: "league-map-point", cx: pointX, cy: pointY, r: 4 }),
      createSvgElement("rect", { x: x - width / 2, y: y - 12, width, height: 24, rx: 5 }),
    );
    const text = createSvgElement("text", { x, y: y + 4, "text-anchor": "middle" });
    text.textContent = region;
    group.appendChild(text);
    labels.appendChild(group);
  });

  return labels;
}

async function renderLeagueMap() {
  try {
    const response = await fetch("./assets/data/china.geojson");
    if (!response.ok) throw new Error(`Map request failed: ${response.status}`);
    const geojson = await response.json();
    const polygons = geojson.features.filter(({ geometry }) =>
      geometry.type === "Polygon" || geometry.type === "MultiPolygon");
    const projector = createProjector(polygons, 1000, 720, 34);
    const southProjector = createProjectorFromLngLatBounds(
      SOUTH_SEA_BOUNDS, SOUTH_SEA_VIEWBOX_WIDTH, SOUTH_SEA_VIEWBOX_HEIGHT, 8);
    const regions = createSvgElement("g", { class: "league-map-regions" });
    const boundaries = createSvgElement("g", { class: "league-map-boundaries" });
    const southRegions = createSvgElement("g", { class: "league-inset-regions" });

    geojson.features.forEach((feature) => {
      const region = feature.properties.name || "";
      const isLine = feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString";
      const path = createSvgElement("path", {
        d: geometryToPath(feature.geometry, projector),
        class: isLine ? "league-boundary" : `league-region${coveredRegions.has(region) ? ` is-covered shade-${window.DAWEI_LEAGUE.findIndex((item) => item.region === region) % 4}` : ""}`,
        "data-region": region,
      });
      if (isLine) boundaries.appendChild(path);
      else {
        if (coveredRegions.has(region)) {
          path.addEventListener("pointerenter", () => activateLeagueRegion(region));
          path.addEventListener("pointerleave", () => activateLeagueRegion(null));
          const linkedCase = casesByRegion.get(region);
          if (linkedCase) {
            path.classList.add("has-case");
            path.setAttribute("tabindex", "0");
            path.setAttribute("role", "button");
            path.setAttribute("aria-label", `${region}，查看案例${linkedCase.number} ${linkedCase.title}`);
            path.addEventListener("focus", () => activateLeagueRegion(region));
            path.addEventListener("blur", () => activateLeagueRegion(null));
            path.addEventListener("click", () => openCase(linkedCase.id));
            path.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCase(linkedCase.id);
              }
            });
          }
        }
        regions.appendChild(path);
      }

      if (isLine || featureIntersectsBounds(feature, SOUTH_SEA_BOUNDS)) {
        southRegions.appendChild(createSvgElement("path", {
          d: geometryToPath(feature.geometry, southProjector),
          class: isLine ? "league-inset-line" : `league-inset-region${coveredRegions.has(region) ? " is-covered" : ""}`,
        }));
      }
    });

    leagueMapSvg.replaceChildren(regions, boundaries, createLeagueLabels(projector));
    leagueSouthSeaSvg.replaceChildren(southRegions);
  } catch (error) {
    leagueMapViewport.classList.add("is-map-error");
    console.warn("National case map unavailable", error);
  }
}

function renderLeagueCaseNav() {
  leagueCaseTrack.replaceChildren();
  const entries = [
    { id: "league", number: "01", title: "全国赛事", image: "./assets/images/league-feature.png" },
    ...[...window.DAWEI_CASES].sort((a, b) => Number(a.number) - Number(b.number)).map((item) => ({
      id: item.id, number: item.number, title: `${item.location} ${item.shortTitle}`,
      image: `./assets/images/case-thumbnails/${item.id}.jpg`,
    })),
  ];

  entries.forEach((item) => {
    const button = document.createElement("button");
    const img = document.createElement("img");
    const copy = document.createElement("span");
    const number = document.createElement("strong");
    const title = document.createElement("span");
    button.type = "button";
    button.className = `league-case-card${item.id === "league" ? " is-selected" : ""}`;
    button.dataset.caseId = item.id;
    button.setAttribute("aria-label", `${item.number} ${item.title}`);
    if (item.id === "league") button.setAttribute("aria-current", "page");
    img.src = item.image;
    img.alt = "";
    number.textContent = item.number;
    title.textContent = item.title;
    copy.append(number, title);
    button.append(img, copy);
    if (item.id !== "league") button.addEventListener("click", () => openCase(item.id));
    leagueCaseTrack.appendChild(button);
  });
}

leagueToggle.addEventListener("click", navigateToLeague);
document.querySelector("#leagueProvinceEntry").addEventListener("click", navigateToHomeTop);
leagueBack.addEventListener("click", navigateBackToHome);
leagueZoom.addEventListener("input", (event) => setLeagueZoom(event.target.value));
document.querySelector("#leagueZoomOut").addEventListener("click", () => setLeagueZoom(leagueView.zoom / 1.15));
document.querySelector("#leagueZoomIn").addEventListener("click", () => setLeagueZoom(leagueView.zoom * 1.15));
leagueMapViewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".league-map-controls, .league-south-sea")) return;
  leagueView.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: leagueView.x, originY: leagueView.y, dragging: false };
});
leagueMapViewport.addEventListener("pointermove", (event) => {
  if (!leagueView.pointer || event.pointerId !== leagueView.pointer.id) return;
  if (!leagueView.pointer.dragging) {
    if (Math.hypot(event.clientX - leagueView.pointer.x, event.clientY - leagueView.pointer.y) < 6) return;
    leagueView.pointer.dragging = true;
    leagueMapViewport.setPointerCapture(event.pointerId);
    leagueMapViewport.classList.add("is-dragging");
  }
  setLeaguePan(leagueView.pointer.originX + event.clientX - leagueView.pointer.x,
    leagueView.pointer.originY + event.clientY - leagueView.pointer.y);
});
function finishLeagueDrag(event) {
  if (!leagueView.pointer || event.pointerId !== leagueView.pointer.id) return;
  leagueView.pointer = null;
  leagueMapViewport.classList.remove("is-dragging");
  if (leagueMapViewport.hasPointerCapture(event.pointerId)) leagueMapViewport.releasePointerCapture(event.pointerId);
}
leagueMapViewport.addEventListener("pointerup", finishLeagueDrag);
leagueMapViewport.addEventListener("pointercancel", finishLeagueDrag);
document.querySelector("#leagueNavPrev").addEventListener("click", () => leagueCaseTrack.scrollBy({ left: -560, behavior: "smooth" }));
document.querySelector("#leagueNavNext").addEventListener("click", () => leagueCaseTrack.scrollBy({ left: 560, behavior: "smooth" }));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !leagueScreen.hidden && !overlay.classList.contains("is-open")) navigateBackToHome();
});

window.addEventListener("popstate", () => renderRoute());

const initialRoute = routeFromHash();
if (!history.state?.dawei || history.state.view !== initialRoute.view || history.state.id !== initialRoute.id) {
  history.replaceState({ dawei: true, ...initialRoute, homeScrollY: initialRoute.view === "home" ? window.scrollY : defaultMapTop(), inAppBack: false }, "", location.href);
}

renderLeagueProvinces();
renderLeagueCaseNav();
renderLeagueMap();
renderRoute({ initial: true });
