export const TILE_URL = 'https://tiles.mapgenie.io/games/elden-ring/the-lands-between/default-v5/{z}/{x}/{y}.jpg';
export const WORLD_BOUNDS = [[0.255, -1.202], [1.24, -0.217]];
export const SHADOW_BOUNDS = [[.15, 1.84], [.39, 2.06]];
export const NATIVE_MIN = 9;
export const NATIVE_MAX = 16;
export const DETAIL_ZOOM = 15.5;
export const MARKER_SIZE = 44;

export const markerDiameter = zoom => Math.max(20, Math.min(38, 37 - (zoom - 12) * 3.6));
export const pointFor = anchor => [anchor.lat, anchor.lng];
export const sourceLink = sourceId => 'https://mapgenie.io/elden-ring/maps/the-lands-between?locationIds=' + sourceId;
export const distanceLabel = distance => distance < 1000 ? Math.round(distance) + ' m' : (distance / 1000).toFixed(1) + ' km';

export function mapLayer(point) {
  if (point.layer) return point.layer;
  if (inBounds(point, SHADOW_BOUNDS)) return 'shadow';
  if (point.place?.endsWith(' · Roundtable Hold')) return 'hold';
  if (typeof point.underground === 'boolean') return point.underground ? 'underground' : 'surface';
  // The Hold inset occupies this part of the ocean on the printed atlas.
  if (point.lat >= .56 && point.lat <= .582 && point.lng >= -.884 && point.lng <= -.847) return 'hold';
  return point.lat < .5 ? 'underground' : 'surface';
}

export function insideWorld(point) {
  return inBounds(point, WORLD_BOUNDS) || inBounds(point, SHADOW_BOUNDS);
}

function inBounds(point, [[south, west], [north, east]]) {
  return point && point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east;
}

export function interpolatePlayer(from, to, progress) {
  const mix = (start, end) => start + (end - start) * progress;
  const mixHeading = (start, end) => {
    const delta = ((end - start) % 360 + 540) % 360 - 180;
    return start + delta * progress;
  };
  return {
    ...to,
    lat: mix(from.lat, to.lat),
    lng: mix(from.lng, to.lng),
    heading: mixHeading(from.heading, to.heading),
    cameraHeading: mixHeading(from.cameraHeading ?? 0, to.cameraHeading ?? 0),
  };
}

export function worldOffset(from, to) {
  const radians = Math.PI / 180;
  // Native map pixels at zoom 15 are scaled at one pixel per world unit.
  const scale = 2 ** 23 / (2 * Math.PI);
  const latitude = point => Math.asinh(Math.tan(point.lat * radians));
  const east = (to.lng - from.lng) * radians * scale;
  const north = (latitude(to) - latitude(from)) * scale;
  return {distance:Math.hypot(east, north), bearing:Math.atan2(east, north) / radians};
}

export function navigationTarget(player, targets, preferredQuest) {
  const preferred = targets.find(target => target.quest.id === preferredQuest);
  let nearest;
  for (const target of preferred ? [preferred] : targets) {
    if (mapLayer(target.anchor) !== mapLayer(player)) continue;
    const offset = worldOffset(player, target.anchor);
    if (!nearest || offset.distance < nearest.distance) nearest = {...target, ...offset};
  }
  return nearest;
}

export function nearbyObjectives(player, quests, nextFor, locationFor) {
  if (!player) return [];
  const layer = mapLayer(player);
  return quests.flatMap(quest => {
    const step = nextFor(quest);
    if (!step) return [];
    const anchor = locationFor(step);
    if (mapLayer(anchor) !== layer) return [];
    return [{quest, distance:worldOffset(player, anchor).distance}];
  }).sort((a, b) => a.distance - b.distance);
}
