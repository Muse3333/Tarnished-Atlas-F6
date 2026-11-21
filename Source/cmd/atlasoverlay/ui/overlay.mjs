import { catchUp, mapGroups, matchesQuestName, nextObjective, questState, remainingObjectives, saveIdentity, skippedObjective } from './quest-model.mjs';
import { TILE_URL, WORLD_BOUNDS, SHADOW_BOUNDS, NATIVE_MIN, NATIVE_MAX, DETAIL_ZOOM, MARKER_SIZE, distanceLabel, insideWorld, interpolatePlayer, mapLayer, markerDiameter, nearbyObjectives, pointFor } from './geo.mjs';
import { missableAlerts } from './missables.mjs';
import { endingRoutes, endingWarnings } from './endings.mjs';
import { navigationPlan } from './travel.mjs';
import { createExplorer, makeShadowChart } from './explore.mjs';

const $ = id => document.getElementById(id);
const character = $('character');
const stepList = $('steps');
const manual = new Map();
const choices = new Map();
const pinned = new Set();
const giverPins = new Set();
const savingPins = new Set();
const notices = [];
const colors = ['#9fc9ef', '#bdca95', '#e8bd87', '#ed9c9a', '#d0b2eb', '#80d9ce', '#ebc676', '#ea98ba'];
const states = { 'not-started':'Not started', 'in-progress':'In progress', completed:'Completed' };
const regions = ['Limgrave','Stormveil Castle','Weeping Peninsula','Roundtable Hold','Liurnia of the Lakes','Caelid','Altus Plateau','Mt. Gelmir','Leyndell, Royal Capital','Mountaintops of the Giants'];
const endingNames = /\b(?:Age of (?:Fracture|Order|the Duskborn|the Stars)|Blessing of Despair|Lord of Frenzied Flame)(?: ending)?\b/g;
let quests = [];
let landmarks = [];
let quest;
let filter = 'all';
let questQuery = '';
let questCampaign = 'base';
const lastCampaignQuest = new Map();
const campaignFor = item => item.dlc ? 'shadow' : 'base';
let questAlerts = [];
let view = 'quests';
let preview;
let progress = { characters: [], complete: {}, available: {}, slot: 0, mode: 'auto', message: 'Reading save…' };
let preferencesReady = false;
let map;
let minimap;
let player;
let minimapPlayer;
let minimapMotion;
let minimapFrame = 0;
let minimapTargets = [];
let minimapSettings = {size:310, opacity:100, corner:'top-right', zoom:13.5, north:true, guideQuest:''};
let plannerPreferences = {waypoint:null, ending:'', spoilerFree:false};
let plannerReady = false;
let plannerWrites = Promise.resolve();
const revealedQuests = new Set();
let nextNearbyRefresh = 0;
let mapNavigationKey;
let liveStatus = '';
let following = true;
let pending = false;
let revision = 0;
let opened = window.atlasStartingOpen !== false;
let ready = false;
let toastTimer;
let observedSave = '';
let observedSteps = new Set();
let observedAlerts = new Set();
let nextRegionRefresh = 0;
let pendingMapAnchor;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, action, className) {
  const element = node('button', text, className);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

function manualKeys() {
  const active = progress.characters?.find(item => item.slot === progress.slot);
  const key = progress.historyKey || (active ? [progress.profile, active.slot, active.name, active.cycle].join(':') : 'no-active-character');
  if (!manual.has(key)) manual.set(key, new Set());
  return manual.get(key);
}

const done = step => Boolean(progress.complete[step.id]) || manualKeys().has(step.id);
const unavailable = step => Boolean(progress.skipped?.[step.id]);
const currentObjective = quest => nextObjective(quest, done, unavailable);
const locationOptions = step => step.locations || (step.alternates ? [step, ...step.alternates] : []);
const location = step => locationOptions(step).find(item => item.sourceId === choices.get(step.id)) || step;
const giverCode = item => '◆' + item.number;
const resolved = q => q.steps.filter(done).length;
const hasPin = q => pinned.has(q.id) || giverPins.has(q.id);
const mapVisible = () => opened && view === 'map';
const realmFor = point => point && mapLayer(point) === 'shadow' ? 'shadow' : 'base';
const realmBounds = realm => realm === 'shadow' ? SHADOW_BOUNDS : WORLD_BOUNDS;
const spoilersHidden = item => plannerPreferences.spoilerFree && !revealedQuests.has(item.id);
const nearby = () => nearbyObjectives(player, quests, currentObjective, location);
const explorer = createExplorer({node, button, guide:guideTo, showQuest, spoilersHidden});

function showNotice(title, detail, color) {
  notices.push({title, detail, color});
  if (!toastTimer) showNextNotice();
}

function showNextNotice() {
  const notice = notices.shift();
  if (!notice) {
    toastTimer = undefined;
    return;
  }
  const card = node('div', '', 'quest-toast');
  if (notice.color) card.style.setProperty('--toast-color', notice.color);
  card.append(node('strong', notice.title), node('span', notice.detail));
  $('quest-updates').replaceChildren(card);
  toastTimer = setTimeout(() => {
    card.remove();
    showNextNotice();
  }, 4200);
}

function notifyProgress(snapshot, alerts) {
  const identity = saveIdentity(snapshot);
  if (!identity) return;
  if (identity !== observedSave) {
    observedSave = identity;
    observedSteps = new Set(Object.keys(snapshot.complete).filter(id => snapshot.complete[id]));
    observedAlerts = new Set(alerts.map(alertKey));
    notices.length = 0;
    const atRisk = alerts.filter(alert => !alert.deadlinePassed).length;
    if (atRisk) showNotice('Missable quests', atRisk + ' at risk. Open Quests → Missable.', '#e98489');
    return;
  }
  const newAlerts = alerts.filter(alert => !observedAlerts.has(alertKey(alert)));
  observedAlerts = new Set(alerts.map(alertKey));
  if (newAlerts.length === 1) {
    const alert = newAlerts[0];
    const item = quests.find(quest => quest.id === alert.quest);
    const detail = spoilersHidden(item) ? 'Open the quest and reveal its notes to see the warning.' : alert.deadlinePassed ? alert.passed : alert.action;
    showNotice(item.name + (alert.deadlinePassed ? ' · Deadline passed' : ' · Missable'), detail, '#e98489');
  } else if (newAlerts.length > 1) {
    showNotice('Missable quests', newAlerts.length + ' new alerts in the journal’s Missable filter.', '#e98489');
  }
  for (const {quest, steps} of catchUp(quests, observedSteps, snapshot.complete)) {
    const detail = steps.length === 1 && !spoilersHidden(quest) ? steps[0].title : steps.length + ' objectives completed';
    showNotice(quest.name + ' updated', detail, quest.color);
  }
}

const alertKey = alert => alert.id + ':' + alert.deadlinePassed;
const alertsFor = item => questAlerts.filter(alert => alert.quest === item.id);

function questBadge(item) {
  const badge = node('span', String(item.number), 'quest-number');
  badge.style.setProperty('--quest-color', item.color);
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

function renderRoster() {
  const options = [new Option('Auto-detect', '0')];
  for (const item of progress.characters || []) {
    options.push(new Option(item.name + ' · Slot ' + item.slot, String(item.slot)));
  }
  character.replaceChildren(...options);
  character.value = progress.mode === 'manual' ? String(progress.slot) : '0';
  if (!character.value) character.value = '0';
  const active = progress.characters?.find(item => item.slot === progress.slot);
  const message = active ? active.name + ' · Slot ' + active.slot + ' · ' + progress.message : progress.message;
  $('status').textContent = message;
  $('status').title = message;
}

function visibleQuests(nearbyItems) {
  const candidates = filter === 'nearby' ? (nearbyItems || nearby()).map(item => item.quest) : quests;
  const matches = candidates.filter(item => campaignFor(item) === questCampaign && matchesQuestName(item.name, questQuery));
  if (filter === 'nearby') return matches;
  if (filter === 'all') return matches;
  if (filter === 'pinned') return matches.filter(hasPin);
  if (filter === 'missable') return matches.filter(item => alertsFor(item).length > 0);
  if (!progress.slot) return [];
  return matches.filter(item => questState(item, done, unavailable) === filter);
}

function renderQuestList() {
  const nearbyItems = filter === 'nearby' ? nearby() : [];
  const shown = visibleQuests(nearbyItems);
  const distances = new Map(nearbyItems.map(({quest,distance}) => [quest, distance]));
  for (const tab of document.querySelectorAll('[data-filter]')) tab.setAttribute('aria-pressed', tab.dataset.filter === filter);
  const total = $('pinned-total');
  const count = quests.filter(hasPin).length;
  total.hidden = count === 0;
  total.textContent = String(count);
  total.setAttribute('aria-label', count + ' quests with pins');
  const groups = new Map(regions.map(region => [region, []]));
  for (const item of shown) {
    const row = button('', () => {
      quest = item;
      renderJournal();
      document.querySelector('.journal').scrollTop = 0;
      $('quest-picker').querySelector('[aria-pressed="true"]')?.focus({ preventScroll:true });
    }, 'quest-row');
    row.setAttribute('aria-pressed', item === quest);
    const heading = node('span', item.name, 'quest-name');
    const details = node('span');
    const state = progress.slot ? states[questState(item, done, unavailable)] : 'Awaiting save';
    const range = distances.has(item) ? distanceLabel(distances.get(item)) + ' · ' : '';
    const summary = range + state + (pinned.has(item.id) ? ' · Pinned' : '') + (giverPins.has(item.id) ? ' · Giver pinned' : '');
    details.append(heading, node('span', summary, 'quest-status'));
    const alerts = alertsFor(item);
    if (alerts.length) details.append(node('span', alerts.some(alert => alert.deadlinePassed) ? 'Deadline passed' : 'Missable', 'quest-alert-label'));
    row.append(questBadge(item), details);
    const region = filter === 'nearby' ? 'Nearest objectives' : item.region.replace(/^Realm of Shadow · /, '');
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(row);
  }
  const sections = [];
  for (const [region, rows] of groups) {
    if (!rows.length) continue;
    const section = node('section', '', 'quest-region');
    section.append(node('h3', region + ' (' + rows.length + ')'), ...rows);
    sections.push(section);
  }
  if (!sections.length) {
    let message = 'No quests in this view.';
    if (filter === 'nearby') message = player ? 'No matching objectives on this map layer.' : 'Waiting for your live player position.';
    else if (!progress.slot && filter !== 'all' && filter !== 'pinned') message = 'Select a character to see quest progress.';
    else if (questQuery) message = 'No matching quest names in this view.';
    else if (filter === 'missable') message = 'No current missable-quest alerts.';
    sections.push(node('p', message, 'quest-status'));
  }
  $('quest-picker').replaceChildren(...sections);
}

function textWithEndings(tag, text, className) {
  const element = node(tag, '', className);
  let start = 0;
  for (const match of text.matchAll(endingNames)) {
    element.append(text.slice(start, match.index), node('strong', match[0], 'quest-ending'));
    start = match.index + match[0].length;
  }
  element.append(text.slice(start));
  return element;
}

function renderQuestNotes(quest, open) {
  const section = node('section', '', 'quest-notes');
  section.append(textWithEndings('p', quest.description, 'quest-description'),
    textWithEndings('p', quest.warning, 'quest-warning'));
  for (const alert of alertsFor(quest)) {
    const warning = node('p', '', 'quest-warning');
    warning.append(node('strong', alert.deadlinePassed ? 'Deadline passed' : 'Missable'), ' · ', alert.deadlinePassed ? alert.passed : alert.action);
    section.append(warning);
  }
  const details = node('details');
  details.dataset.quest = quest.id;
  details.open = open;
  details.append(node('summary', 'Choices, requirements & spoilers'));
  const list = node('dl');
  for (const {label, text} of quest.notes) {
    list.append(textWithEndings('dt', label), textWithEndings('dd', text));
  }
  details.append(list);
  section.append(details);
  return section;
}

function selectQuestCampaign(campaign, item) {
  if (quest) lastCampaignQuest.set(questCampaign, quest);
  questCampaign = campaign;
  quest = item || lastCampaignQuest.get(campaign) || quests.find(entry => campaignFor(entry) === campaign);
  const tabs = $('quest-campaigns').querySelectorAll('[data-campaign]');
  for (const tab of tabs) {
    const selected = tab.dataset.campaign === campaign;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) $('quest-panel').setAttribute('aria-labelledby', tab.id);
  }
  filter = 'all';
  questQuery = '';
  $('quest-search').value = '';
  preview = undefined;
  renderJournal();
  $('quest-picker').closest('.quest-list').scrollTop = 0;
  document.querySelector('.journal').scrollTop = 0;
}

function showQuest(item) {
  selectQuestCampaign(campaignFor(item), item);
  setView('quests');
}

function renderObjective() {
  const target = $('objective');
  const next = currentObjective(quest);
  const hideSpoilers = spoilersHidden(quest);
  const head = node('div', '', 'quest-header');
  const text = node('div');
  text.append(node('p', quest.region, 'eyebrow'), node('h2', quest.name));
  if (quest.giver) {
    text.append(node('p', 'Quest giver · ' + quest.giver.place, 'place'));
    if (quest.giver.hint && !hideSpoilers) text.append(node('p', quest.giver.hint, 'stage-info'));
  }
  const gauge = node('div', '', 'quest-progress');
  const count = resolved(quest);
  const bar = node('progress');
  bar.max = quest.steps.length;
  bar.value = count;
  bar.setAttribute('aria-label', quest.name + ' progress');
  const state = progress.slot ? states[questState(quest, done, unavailable)] : 'Awaiting save';
  gauge.append(node('span', state + ' · ' + count + ' / ' + quest.steps.length + ' steps'), bar);
  text.append(gauge);

  const actions = node('div', '', 'quest-actions');
  const picked = quest;
  const pinButton = button(pinned.has(picked.id) ? 'Unpin quest' : 'Pin quest', () => togglePin(picked), 'pin-action');
  pinButton.setAttribute('aria-pressed', pinned.has(picked.id));
  pinButton.disabled = !preferencesReady || savingPins.has(picked.id + ':quest') || (!next && !pinned.has(picked.id));
  const giverButton = button(giverPins.has(picked.id) ? 'Unpin quest giver' : 'Pin quest giver', () => togglePin(picked, true), 'giver-action');
  giverButton.setAttribute('aria-pressed', giverPins.has(picked.id));
  giverButton.disabled = !picked.giver || !preferencesReady || savingPins.has(picked.id + ':giver');
  const show = button('Show on map', () => {
    if (next) openObjective(picked);
    else {
      preview = giverPins.has(picked.id) ? {quest:picked, giver:picked.giver} : undefined;
      setView('map');
    }
  }, 'subtle');
  show.disabled = !next && !giverPins.has(picked.id);
  const allSteps = button('Show all steps', () => openObjective(picked, {all:true}), 'subtle');
  actions.append(pinButton, giverButton, show);
  if (!hideSpoilers) actions.append(allSteps);
  if (plannerPreferences.spoilerFree) actions.append(button(hideSpoilers ? 'Reveal full quest' : 'Hide spoilers', () => {
    if (hideSpoilers) revealedQuests.add(picked.id);
    else revealedQuests.delete(picked.id);
    renderJournal();
    refreshMarkers();
    target.querySelector('.spoiler-action')?.focus({preventScroll:true});
  }, 'spoiler-action subtle'));
  head.append(text, actions);

  const card = node('section', '', 'next-card');
  if (next) {
    const heading = next.optional ? 'NEXT OBJECTIVE · OPTIONAL' : 'NEXT OBJECTIVE';
    card.append(node('p', heading, 'eyebrow'), node('h3', next.title), node('p', location(next).place, 'place'));
    if (hideSpoilers) {
      const hint = node('details', '', 'step-hint');
      hint.open = Boolean(target.querySelector('.step-hint')?.open && target.querySelector('.next-card')?.dataset.step === next.id);
      hint.append(node('summary', 'Reveal step hint'), textWithEndings('p', next.hint, 'hint'));
      card.append(hint);
    } else {
      card.append(textWithEndings('p', next.hint, 'hint'));
    }
    card.dataset.step = next.id;
    const locations = locationOptions(next);
    if (locations.length > 1) {
      const label = node('label', 'Current location');
      const select = node('select');
      for (const place of locations) {
        select.add(new Option(place.place, String(place.sourceId), false, place.sourceId === location(next).sourceId));
      }
      select.addEventListener('change', () => {
        choices.set(next.id, Number(select.value));
        renderObjective();
        refreshMarkers();
        target.querySelector('select')?.focus({preventScroll:true});
      });
      label.append(select);
      card.append(label);
    }
  } else {
    const message = remainingObjectives(quest, done, unavailable).length ? 'Main route complete. Optional steps remain.' : 'Quest complete.';
    card.append(node('h3', message));
  }
  if (hideSpoilers) target.replaceChildren(head, card);
  else {
    const previousNotes = target.querySelector('details[data-quest]');
    const notes = renderQuestNotes(picked, previousNotes?.dataset.quest === picked.id && previousNotes.open);
    target.replaceChildren(head, notes, card);
  }
}

function renderSteps() {
  const picked = quest;
  const next = currentObjective(picked);
  const visible = spoilersHidden(picked) ? (next ? [next] : []) : picked.steps;
  const rows = visible.map((step, rowIndex) => {
    const index = picked.steps.indexOf(step);
    const row = node('li');
    row.dataset.next = String(step === next);
    const skipped = !done(step) && skippedObjective(picked, step, done, unavailable);
    const tick = node('input');
    tick.type = 'checkbox';
    tick.checked = done(step);
    tick.disabled = !progress.slot || Boolean(progress.complete[step.id]) || skipped;
    tick.setAttribute('aria-label', 'Completed: ' + step.title);
    tick.addEventListener('change', async () => {
      const {historyKey} = progress;
      const checked = tick.checked;
      if (historyKey) {
        tick.disabled = true;
        try {
          const response = await fetch('manual-progress', {method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({profile:historyKey,step:step.id,checked})});
          if (!response.ok) throw Error();
        } catch {
          showNotice('Could not save the quest check','Select the active character and try again.');
          renderJournal();
          return;
        }
        if (progress.historyKey !== historyKey) return;
      }
      const marks = manualKeys();
      if (checked) marks.add(step.id);
      else marks.delete(step.id);
      if (historyKey) {
        manual.set(historyKey,marks);
        progress.manual = Array.from(marks).sort();
      }
      questAlerts = missableAlerts(progress, id => manualKeys().has(id));
      renderJournal();
      refreshMarkers();
      stepList.querySelectorAll('input')[rowIndex]?.focus({preventScroll:true});
    });
    const text = node('div');
    text.append(node('span', String(index + 1) + '. ' + step.title, 'step-title'));
    const state = progress.complete[step.id] ? 'Auto-complete' : tick.checked ? 'Marked complete' :
      unavailable(step) ? 'Skipped · No longer available' : skipped ? 'No longer required' :
      !progress.slot ? 'Awaiting save' : progress.available[step.id] ? (step.optional ? 'Optional' : 'Remaining') : 'Manual check';
    text.append(node('p', location(step).place + ' · ' + state, 'stage-info' + (progress.complete[step.id] ? ' auto' : '')));
    const onMap = button('Map', () => openObjective(picked, {step}));
    onMap.setAttribute('aria-label', 'Map: ' + step.title);
    row.append(tick, text, onMap);
    return row;
  });
  stepList.replaceChildren(...rows);
}

function renderJournal() {
  const shown = visibleQuests();
  if (!shown.includes(quest)) quest = shown[0];
  renderQuestList();
  if (!quest) {
    $('objective').replaceChildren(node('h2','No matching quests'));
    stepList.replaceChildren();
    return;
  }
  renderObjective();
  renderSteps();
}

async function togglePin(item, giver = false) {
  const collection = giver ? giverPins : pinned;
  const key = item.id + (giver ? ':giver' : ':quest');
  if (!preferencesReady || savingPins.has(key)) return;
  const set = !collection.has(item.id);
  savingPins.add(key);
  $('pin-notice').hidden = true;
  if (set) collection.add(item.id);
  else collection.delete(item.id);
  renderJournal();
  try {
    const response = await fetch('pins', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({questId:item.id,pinned:set,kind:giver ? 'giver' : ''}) });
    if (!response.ok) throw Error();
  } catch {
    if (set) collection.delete(item.id);
    else collection.add(item.id);
    $('pin-notice').textContent = 'Could not save the pin. Try again.';
    $('pin-notice').hidden = false;
    if (mapVisible()) showNotice('Could not save the pin', item.name);
  } finally {
    savingPins.delete(key);
    renderJournal();
    if (item === quest && !mapVisible()) document.querySelector(giver ? '.giver-action' : '.pin-action')?.focus({preventScroll:true});
    refreshMarkers();
  }
}

function createMap(id) {
  const L = window.L;
  const mini = id === 'minimap';
  const camera = L.map(id, {
    minZoom: 8, maxZoom: 17, zoomSnap: .25, zoomDelta: .5, zoomControl: false,
    attributionControl: false, inertia: false, maxBounds: L.latLngBounds(WORLD_BOUNDS).pad(.25),
    scrollWheelZoom: mini ? 'center' : true,
    doubleClickZoom: mini ? 'center' : true,
    touchZoom: mini ? 'center' : true
  });
  const markers = L.layerGroup().addTo(camera);
  const container = camera.getContainer();
  container.addEventListener('contextmenu', event => event.preventDefault());
  const landsBetween = L.tileLayer(TILE_URL, { minNativeZoom: NATIVE_MIN, maxNativeZoom: NATIVE_MAX, noWrap: true, referrerPolicy:'no-referrer' }).addTo(camera);
  const scale = mini ? 0.76 : 1;
  camera.on('zoom', () => {
    container.style.setProperty('--pin-size', markerDiameter(camera.getZoom()) * scale + 'px');
  });
  if (mini) {
    camera.on('move resize', () => {
      // Leaflet pans by translating its map pane. Locate the visible center in
      // pane coordinates so the rotation and clipping stay centered on screen.
      const halfSize = camera.getSize().divideBy(2);
      const center = camera.containerPointToLayerPoint(halfSize);
      container.style.setProperty('--mini-center', center.x + 'px ' + center.y + 'px');
      container.style.setProperty('--mini-radius', halfSize.x + 'px');
    });
    camera.on('dragstart', () => setFollow(false));
    camera.on('zoomend', () => {
      centerMinimap();
      updateMinimapBearing();
    });
    camera.on('resize', updateMinimapBearing);
  } else {
    camera.on('contextmenu', ({latlng}) => setWaypoint(latlng));
  }
  return {camera, markers, landsBetween, realm:'base', navigationMarkers:L.layerGroup().addTo(camera)};
}

function switchRealm(target, realm, anchor) {
  if (!target || target.realm === realm) return false;
  const {camera} = target;
  target.realm = realm;
  target.navigationKey = undefined;
  camera.closePopup();
  camera.setMaxBounds(null);
  if (realm === 'shadow') {
    target.landsBetween.remove();
    target.shadow ||= makeShadowChart(window.L, landmarks, target === minimap, node, guideTo);
    target.shadow.addTo(camera);
  } else {
    target.shadow?.remove();
    target.landsBetween.addTo(camera);
  }
  const bounds = window.L.latLngBounds(realmBounds(realm));
  if (anchor) camera.setView(pointFor(anchor), target === minimap ? minimapSettings.zoom : DETAIL_ZOOM, {animate:false});
  else camera.fitBounds(bounds, {animate:false});
  camera.setMaxBounds(bounds.pad(.25));
  if (target === map) {
    $('map-realm').value = realm;
    $('map-credit').textContent = realm === 'shadow' ? 'Realm of Shadow · Landmark chart' : 'Map and coordinates © Map Genie';
  }
  return true;
}

function setFollow(enabled) {
  following = enabled;
  $('mini-follow').setAttribute('aria-pressed', enabled);
  $('mini-follow').textContent = enabled ? 'Following' : 'Follow';
  updateMinimapBearing();
  if (enabled) {
    minimap?.camera.closePopup();
    centerMinimap();
  }
}

function updateMinimapBearing() {
  if (!minimap) return;
  const heading = following && !minimap.popupOpen ? minimapPlayer?.cameraHeading ?? 0 : 0;
  if (heading !== minimap.bearing) {
    minimap.bearing = heading;
    minimap.camera.getContainer().style.setProperty('--mini-turn', -heading + 'deg');
  }
  renderMinimapNavigation(heading);
}

function positionOnMinimap(element, degrees, radius) {
  const radians = degrees * Math.PI / 180;
  const x = Math.sin(radians) * radius;
  const y = -Math.cos(radians) * radius;
  element.style.setProperty('--minimap-marker-x', x.toFixed(1) + 'px');
  element.style.setProperty('--minimap-marker-y', y.toFixed(1) + 'px');
}

function renderMinimapNavigation(heading) {
  const radius = minimap.camera.getSize().x / 2;
  const north = $('mini-north');
  north.hidden = !minimapSettings.north || minimap.popupOpen || radius < 45;
  if (!north.hidden) positionOnMinimap(north, -heading, radius - 11);

  const origin = minimapPlayer || (liveStatus === 'Roundtable Hold' ? {place:'Roundtable Hold · Roundtable Hold'} : undefined);
  const target = navigationPlan(origin, minimapTargets, minimapSettings.guideQuest, plannerPreferences.waypoint, progress.complete);
  const passage = target?.passage;
  updateNavigationMarkers(minimap, passage);
  if (mapVisible() && map) {
    updateNavigationMarkers(map, passage);
    renderMapNavigation(target);
  }
  const routeLabel = $('mini-route');
  routeLabel.hidden = !passage || !following || Boolean(minimap.popupOpen) || radius < 60;
  if (!routeLabel.hidden && routeLabel.textContent !== passage.label) routeLabel.textContent = passage.label;
  const guide = $('mini-guide');
  guide.hidden = target?.distance === undefined || !following || Boolean(minimap.popupOpen) || radius < 60 ||
    target.distance * 2 ** (minimap.camera.getZoom() - 15) < radius - 6;
  if (guide.hidden) return;
  const relativeBearing = target.bearing - heading;
  positionOnMinimap(guide, relativeBearing, radius - 33);
  guide.style.setProperty('--objective-turn', relativeBearing + 'deg');
  guide.style.setProperty('--objective-color', target.color);
  const distance = distanceLabel(target.distance);
  const label = $('mini-guide-distance');
  if (label.textContent !== distance) label.textContent = distance;
  const title = passage ? passage.label : target.title;
  if (guide.title !== title) guide.title = title;
}

function updateNavigationMarkers(target, passage) {
  const waypoint = plannerPreferences.waypoint;
  const key = JSON.stringify([waypoint, passage?.anchor, passage?.label]);
  if (target.navigationKey === key) return;
  target.navigationKey = key;
  target.navigationMarkers.clearLayers();
  for (const [anchor, name, className] of [
    [waypoint, waypoint?.label || 'Custom waypoint', 'waypoint-marker'],
    [passage?.anchor, passage?.label, 'transfer-marker'],
  ]) {
    if (!anchor || realmFor(anchor) !== target.realm) continue;
    const icon = window.L.divIcon({className,html:node('span'),iconSize:[23,23],iconAnchor:[11,11]});
    window.L.marker(pointFor(anchor), {icon,title:name,interactive:false,keyboard:false,zIndexOffset:1600}).addTo(target.navigationMarkers);
  }
}

function renderMapNavigation(plan) {
  const panel = $('map-navigation');
  const waypoint = plannerPreferences.waypoint;
  const key = JSON.stringify([waypoint, plan?.title, plan?.passage]);
  if (key === mapNavigationKey) return;
  mapNavigationKey = key;
  panel.hidden = !waypoint && !plan?.passage;
  panel.replaceChildren();
  if (waypoint) panel.append(node('strong', waypoint.label || 'Custom waypoint'));
  if (plan?.passage) {
    const {anchor,label,detail} = plan.passage;
    panel.append(node('p', label, 'route-name'), node('p', detail));
    if (anchor) panel.append(button('Show transfer on map', () => focusMapPoint(anchor)));
  }
}

function setWaypoint(latlng, label = '') {
  if (!plannerReady || !insideWorld(latlng)) return;
  savePlannerPreferences({waypoint:{lat:latlng.lat,lng:latlng.lng,label}});
}

function guideTo(point, label) {
  if (!point || !insideWorld(point)) return;
  if (!plannerReady) {
    showNotice('Waypoint unavailable', 'Wait for the planner settings to load, then try again.');
    return;
  }
  setWaypoint(point,label);
  preview = undefined;
  pendingMapAnchor = point;
  setView('map');
}

function focusMapPoint(point, zoom = DETAIL_ZOOM) {
  switchRealm(map,realmFor(point),point);
  map.camera.setView(pointFor(point),zoom,{animate:false});
  refreshMarkers();
}

function centerMinimap() {
  if (!minimap || !following || minimap.popupOpen) return;
  const camera = minimap.camera;
  if (minimapPlayer) {
    const position = pointFor(minimapPlayer);
    const offset = camera.project(position).subtract(camera.project(camera.getCenter())).round();
    if (offset.x || offset.y) camera.panTo(position, {animate:false});
  } else if (liveStatus === 'Roundtable Hold') {
    const home = quests.find(item => item.id === 'melina').steps.find(step => step.place === 'Roundtable Hold · Roundtable Hold');
    if (home) camera.panTo(pointFor(home), {animate:false});
  }
}

function drawPlayer(target, position) {
  if (!target) return;
  if (!position || realmFor(position) !== target.realm) {
    target.arrow?.remove();
    target.arrow = undefined;
    return;
  }
  if (!target.arrow) {
    target.headingIcon = node('span', '', 'player-arrow');
    const icon = window.L.divIcon({
      className:'player-position', html:target.headingIcon, iconSize:[32,32], iconAnchor:[16,16]
    });
    target.arrow = window.L.marker(pointFor(position), {icon,interactive:false,keyboard:false,zIndexOffset:3500}).addTo(target.camera);
  } else {
    const current = target.arrow.getLatLng();
    if (current.lat !== position.lat || current.lng !== position.lng) target.arrow.setLatLng(pointFor(position));
  }
  target.headingIcon.style.transform = 'rotate(' + position.heading + 'deg)';
}

function paintMinimapPlayer(position) {
  minimapPlayer = position;
  centerMinimap();
  drawPlayer(minimap, position);
  updateMinimapBearing();
}

function animateMinimapPlayer(now) {
  const {from, to, startedAt} = minimapMotion;
  const progress = Math.min(1, Math.max(0, (now - startedAt) / 34));
  minimapFrame = progress < 1 ? requestAnimationFrame(animateMinimapPlayer) : 0;
  paintMinimapPlayer(progress < 1 ? interpolatePlayer(from, to, progress) : to);
}

function trackMinimapPlayer(position) {
  if (!minimap) return;
  if (position && switchRealm(minimap,realmFor(position),position)) refreshMarkers();
  if (liveStatus === 'Roundtable Hold' && switchRealm(minimap,'base')) refreshMarkers();
  // Large jumps can span fast travel or a map-layer change and snap into place.
  if (position && minimapPlayer &&
      Math.hypot(position.lat - minimapPlayer.lat, position.lng - minimapPlayer.lng) < .003) {
    minimapMotion = {from:minimapPlayer, to:position, startedAt:performance.now()};
    if (!minimapFrame) minimapFrame = requestAnimationFrame(animateMinimapPlayer);
  } else {
    cancelAnimationFrame(minimapFrame);
    minimapFrame = 0;
    paintMinimapPlayer(position);
  }
}

window.setAtlasPlayer = (position, status) => {
  if (Boolean(player) !== Boolean(position)) {
    $('locate-player').disabled = !position;
    $('mini-follow').disabled = !position;
  }
  player = position;
  liveStatus = status || 'Waiting for player';
  const statusLabel = $('mini-status');
  const text = player && !player.cameraAvailable ? liveStatus + ' · Camera heading unavailable' : liveStatus;
  if (statusLabel.textContent !== text) statusLabel.textContent = text;
  trackMinimapPlayer(position);
  if (mapVisible()) drawPlayer(map, player);
  if (opened && view === 'quests' && filter === 'nearby' && performance.now() >= nextNearbyRefresh) {
    nextNearbyRefresh = performance.now() + 700;
    if (!quest && position) renderJournal();
    else renderQuestList();
  }
  if (opened && view === 'checklist' && performance.now() >= nextRegionRefresh) {
    nextRegionRefresh = performance.now() + 700;
    explorer.updateRegion(player);
  }
};

function locatePlayer() {
  if (!player || !map) return;
  preview = undefined;
  focusMapPoint(player,Math.max(13,map.camera.getZoom()));
}

function mapLegend() {
  const rows = quests.filter(item => giverPins.has(item.id) || (pinned.has(item.id) && currentObjective(item))).map(item => {
    const row = node('div', '', 'legend-row');
    const next = pinned.has(item.id) && currentObjective(item);
    const objective = next ? ' · ' + location(next).place : '';
    row.append(questBadge(item), node('span', item.name + objective + (giverPins.has(item.id) ? ' · ◆ Giver' : '')));
    return row;
  });
  if (!rows.length) rows.push(node('p', 'Right-click a marker for quest actions.'));
  const objective = previewObjective();
  if (preview) {
    if (preview.all) rows.push(node('p', 'All steps · ' + preview.quest.name, 'preview-note'));
    else if (objective) rows.push(node('p', 'Viewing ' + objective.title, 'preview-note'));
    rows.push(button('Show current pins', () => {
      preview = undefined;
      fitPreferred(refreshMarkers());
    }, 'subtle'));
  }
  $('map-legend').replaceChildren(...rows);
}

function refreshMarkers() {
  const options = {giverPins, isUnavailable:unavailable};
  const miniGroups = mapGroups(quests, pinned, done, location, options);
  minimapTargets = miniGroups.flatMap(group => group.objectives
    .filter(objective => objective.tracked)
    .map(objective => ({...objective, anchor:group.anchor})));
  if (minimap) {
    drawMarkers(minimap, miniGroups, true);
    updateMinimapBearing();
  }
  if (view === 'settings') renderGuideOptions($('hud-guide-quest').value);
  if (!map) return miniGroups;
  const groups = preview ? mapGroups(quests, pinned, done, location, {...options, preview}) : miniGroups;
  drawMarkers(map, groups, false);
  $('remaining-pins').disabled = !groups.some(group => realmFor(group.anchor) === map.realm);
  mapLegend();
  return groups;
}

function drawMarkers(target, groups, mini) {
  target.markers.clearLayers();
  for (const group of groups) {
    if (realmFor(group.anchor) !== target.realm) continue;
    const tracked = group.objectives.filter(item => item.tracked);
    const viewed = group.viewedSteps;
    const discovery = !tracked.length && !group.givers.length && !viewed.length;
    const previewPin = viewed.length || group.objectives.some(item => item.focused) ||
      (!mini && group.givers.some(item => item === preview?.quest && preview.giver));
    const captions = [...tracked.map(item => String(item.quest.number)), ...group.givers.map(giverCode)];
    if (group.objectives.some(item => !item.tracked)) captions.push('!');
    if (viewed.length) {
      const steps = viewed.map(item => item.number).join(', ');
      captions.push((viewed.length > 1 ? 'Steps ' : 'Step ') + steps);
    }
    const pill = node('span', captions.join(' '), 'pin-number');
    if (!discovery) pill.style.setProperty('--pin-color', (viewed[0]?.quest || tracked[0]?.quest || group.givers[0]).color);
    const icon = window.L.divIcon({
      className:'atlas-anchor' + (tracked.length ? ' next' : '') + (previewPin ? ' preview' : '') +
        (discovery ? ' discovery' : !tracked.length && group.givers.length ? ' giver' : ''),
      html:pill, iconSize:[MARKER_SIZE,MARKER_SIZE], iconAnchor:[MARKER_SIZE/2,MARKER_SIZE/2]
    });
    const labels = [
      ...group.objectives.map(item => (item.tracked ? item.quest.number : '! Unpinned') + ' · ' + item.quest.name + ' · ' + item.step.title),
      ...group.givers.map(item => giverCode(item) + ' · Quest giver · ' + item.name),
      ...viewed.map(item => 'Step ' + item.number + ' · ' + item.step.title + (done(item.step) ? ' · Complete' : ''))
    ];
    const title = labels.join(' / ');
    const zIndexOffset = previewPin ? 2000 : tracked.length ? 1000 : discovery ? -100 : 0;
    const marker = window.L.marker(pointFor(group.anchor), {icon,title,zIndexOffset,bubblingMouseEvents:false}).addTo(target.markers);
    marker.getElement()?.setAttribute('aria-label', title);
    marker.bindPopup(() => markerMenu(group, labels, mini), {
      maxWidth:mini ? 192 : 300, maxHeight:mini ? 145 : 320, autoPanPadding:[14,22]
    });
    marker.on('contextmenu', event => {
      window.L.DomEvent.stop(event.originalEvent);
      marker.openPopup();
    });
  }
}

function markerMenu(group, labels, mini) {
  const popup = node('div', '', 'pin-details');
  popup.append(node('strong', group.anchor.place));
  const list = node('ul');
  for (const label of labels) list.append(node('li', label));
  popup.append(list);
  if (!mini && plannerReady) popup.append(button('Set waypoint here', () => {
    map.camera.closePopup();
    setWaypoint(group.anchor);
  }, 'marker-waypoint'));
  const entries = new Set([...group.objectives.map(item => item.quest), ...group.givers, ...group.viewedSteps.map(item => item.quest)]);
  for (const item of entries) {
    const next = currentObjective(item);
    const actions = node('section', '', 'marker-actions');
    actions.append(node('strong', item.name));
    const controls = node('div');
    const pin = button(pinned.has(item.id) ? 'Unpin quest' : 'Pin quest', () => togglePin(item));
    pin.disabled = !preferencesReady || savingPins.has(item.id + ':quest') || (!next && !pinned.has(item.id));
    const show = button('Current objective', () => openObjective(item));
    show.disabled = !next;
    controls.append(pin, show);
    if (!spoilersHidden(item)) controls.append(button('All steps', () => openObjective(item, {all:true})));
    controls.append(button('Journal', () => showQuest(item)));
    actions.append(controls);
    popup.append(actions);
  }
  return popup;
}

function fitPins(target, groups) {
  const {camera} = target;
  const positions = groups.filter(group => realmFor(group.anchor) === target.realm).map(group => pointFor(group.anchor));
  if (positions.length === 1) camera.setView(positions[0], DETAIL_ZOOM, {animate:false});
  else if (positions.length > 1) {
    const mini = target === minimap;
    camera.fitBounds(positions,{paddingTopLeft:mini ? [16,24] : [32,106],paddingBottomRight:mini ? [16,38] : [44,38],maxZoom:DETAIL_ZOOM,animate:false});
  } else {
    camera.fitBounds(realmBounds(target.realm),{animate:false});
  }
}

function fitPreferred(groups) {
  const pinnedGroups = groups.filter(group => realmFor(group.anchor) === map.realm && (group.givers.length || group.objectives.some(item => item.tracked)));
  fitPins(map, pinnedGroups.length ? pinnedGroups : groups);
}

function frameMinimap(groups) {
  const tracked = groups.find(group => group.objectives.some(item => item.tracked));
  const giver = groups.find(group => group.givers.length);
  const gatefront = quests.find(item => item.id === 'melina').steps[0];
  const target = player || tracked?.anchor || giver?.anchor || gatefront;
  switchRealm(minimap,realmFor(target),target);
  minimap.camera.setView(pointFor(target), minimapSettings.zoom, {animate:false});
}

function setView(mode) {
  view = mode;
  if (mode === 'settings') renderMinimapSettings();
  if (mode === 'endings') renderEndingPlanner();
  explorer.draw(mode,progress,quests,player);
  if (mode === 'quests' && filter === 'nearby') renderJournal();
  renderView();
}

function renderView() {
  $('quests-view').hidden = !opened || view !== 'quests';
  $('map-view').hidden = !mapVisible();
  $('settings-view').hidden = !opened || view !== 'settings';
  $('endings-view').hidden = !opened || view !== 'endings';
  for (const id of ['weapons','checklist','history']) {
    $(id + '-view').hidden = !opened || view !== id;
    $(id + '-tab').setAttribute('aria-pressed', view === id);
  }
  $('quests-tab').setAttribute('aria-pressed', view === 'quests');
  $('map-tab').setAttribute('aria-pressed', view === 'map');
  $('settings-tab').setAttribute('aria-pressed', view === 'settings');
  $('endings-tab').setAttribute('aria-pressed', view === 'endings');
  if (!ready) return;
  const miniFirst = !minimap;
  if (miniFirst) {
    minimap = createMap('minimap');
    minimap.camera.on('popupopen popupclose', ({type}) => {
      minimap.popupOpen = type === 'popupopen';
      minimap.camera.getContainer().classList.toggle('minimap-popup-open', minimap.popupOpen);
      centerMinimap();
      updateMinimapBearing();
    });
    frameMinimap(refreshMarkers());
    if (minimap.realm === 'shadow') refreshMarkers();
    paintMinimapPlayer(player);
  }
  minimap.camera.invalidateSize({animate:false});
  centerMinimap();
  if (!mapVisible()) return;

  const first = !map;
  if (first) {
    map = createMap('map');
    map.camera.fitBounds(WORLD_BOUNDS, {animate:false});
    if (player) switchRealm(map,realmFor(player),player);
  }
  map.camera.invalidateSize({animate:false});
  if (pendingMapAnchor) {
    focusMapPoint(pendingMapAnchor);
    pendingMapAnchor = undefined;
  } else if (preview?.all) {
    switchRealm(map,realmFor(preview.quest.steps[0]));
  } else {
    centerPreview();
  }
  const groups = refreshMarkers();
  drawPlayer(map, player);
  updateMinimapBearing();
  if (preview?.all) fitPins(map, groups.filter(group => group.viewedSteps.length));
}

function setOpen(active) {
  opened = active;
  document.body.classList.toggle('hud', !opened);
  if (!opened) {
    map?.camera.closePopup();
    setFollow(true);
  }
  renderView();
}

window.setAtlasOpen = setOpen;

function previewObjective() {
  return preview && !preview.giver && !preview.all ? preview.step || currentObjective(preview.quest) : undefined;
}

function centerPreview() {
  const step = previewObjective();
  const anchor = preview?.giver || (step && location(step));
  if (anchor) focusMapPoint(anchor);
}

function openObjective(item, options = {}) {
  if (spoilersHidden(item) && (options.all || options.step && options.step !== currentObjective(item))) return;
  preview = {quest:item, ...options};
  setView('map');
}

async function refresh(slot) {
  if (slot === undefined && pending) return;
  const request = ++revision;
  pending = true;
  try {
    const options = slot === undefined ? {} : {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({slot})
    };
    const response = await fetch('progress', options);
    if (!response.ok) throw Error();
    const snapshot = await response.json();
    if (request !== revision || JSON.stringify(progress) === JSON.stringify(snapshot)) return;
    const changedCharacter = progress.slot !== snapshot.slot || progress.profile !== snapshot.profile;
    const markersChanged = changedCharacter || JSON.stringify(progress.complete) !== JSON.stringify(snapshot.complete) ||
      JSON.stringify(progress.skipped) !== JSON.stringify(snapshot.skipped);
    const previousObjective = previewObjective();
    if (changedCharacter) preview = undefined;
    progress = snapshot;
    if (snapshot.historyKey) manual.set(snapshot.historyKey,new Set(snapshot.manual));
    questAlerts = missableAlerts(snapshot, id => manualKeys().has(id));
    notifyProgress(snapshot, questAlerts);
    renderRoster();
    renderJournal();
    explorer.draw(view,progress,quests,player);
    if (view === 'endings') renderEndingPlanner();
    if (markersChanged) {
      refreshMarkers();
      if (mapVisible() && previewObjective() !== previousObjective) centerPreview();
    }
  } catch {
    if (request === revision) $('status').textContent = 'The local save reader is temporarily unavailable.';
  } finally {
    if (request === revision) pending = false;
  }
}

function renderGuideOptions(selection) {
  const select = $('hud-guide-quest');
  const options = [new Option('Nearest pinned quest', '')];
  for (const item of quests) {
    if (pinned.has(item.id) && currentObjective(item)) options.push(new Option(item.name, item.id));
  }
  select.replaceChildren(...options);
  select.value = options.some(option => option.value === selection) ? selection : '';
}

function renderEndingPlanner() {
  $('desired-ending').value = plannerPreferences.ending;
  const panel = $('ending-plan');
  panel.replaceChildren();
  const route = endingRoutes[plannerPreferences.ending];
  if (!route) return;
  const list = node('ol', '', 'ending-checklist');
  for (const task of route.tasks) {
    const item = quests.find(quest => quest.id === task.quest);
    const step = item.steps.find(step => step.id === task.step);
    const checked = done(step);
    const row = node('li');
    const details = node('div');
    const state = checked ? 'Complete' : unavailable(step) ? 'Unavailable' :
      !progress.slot ? 'Awaiting save' : progress.available[step.id] ? 'Remaining' : 'Unverified';
    details.append(node('strong', task.label), node('p', item.name + ' · ' + state, checked ? 'stage-info auto' : 'stage-info'));
    const open = button('Open quest', () => showQuest(item), 'subtle');
    open.setAttribute('aria-label', 'Open quest: ' + item.name);
    row.append(details, open);
    list.append(row);
  }
  panel.append(list, node('p', route.finale, 'ending-finale'));
  for (const warning of endingWarnings(plannerPreferences.ending, progress)) {
    panel.append(node('p', warning, 'quest-warning'));
  }
}

function applyPlannerPreferences(next) {
  const spoilerChanged = plannerPreferences.spoilerFree !== next.spoilerFree;
  const waypointChanged = JSON.stringify(plannerPreferences.waypoint) !== JSON.stringify(next.waypoint);
  plannerPreferences = next;
  $('spoiler-free').checked = next.spoilerFree;
  $('clear-waypoint').hidden = !next.waypoint;
  $('spoiler-free').disabled = !plannerReady;
  $('desired-ending').disabled = !plannerReady;
  if (spoilerChanged) {
    revealedQuests.clear();
    if (next.spoilerFree) {
      if (preview?.all || preview?.step) preview = undefined;
      clearTimeout(toastTimer);
      toastTimer = undefined;
      notices.length = 0;
      $('quest-updates').replaceChildren();
    }
    renderJournal();
  }
  if (waypointChanged || spoilerChanged) refreshMarkers();
  if (view === 'endings') renderEndingPlanner();
  if (view === 'history') explorer.draw(view,progress,quests,player);
}

async function loadPlannerPreferences() {
  try {
    const response = await fetch('planner');
    if (!response.ok) throw Error();
    const saved = await response.json();
    plannerReady = true;
    applyPlannerPreferences(saved);
  } catch {
    showNotice('Planner settings unavailable', 'Check the overlay’s local preferences.');
  }
}

function savePlannerPreferences(patch) {
  plannerWrites = plannerWrites.then(async () => {
    try {
      const response = await fetch('planner', {method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
      if (!response.ok) throw Error();
      applyPlannerPreferences(await response.json());
    } catch {
      $('spoiler-free').checked = plannerPreferences.spoilerFree;
      $('desired-ending').value = plannerPreferences.ending;
      showNotice('Could not save your change', 'Try again.');
    }
  });
}

function updateSettingsLabels() {
  $('hud-size-value').textContent = $('hud-size').value + ' px';
  $('hud-opacity-value').textContent = $('hud-opacity').value + '%';
  $('hud-zoom-value').textContent = $('hud-zoom').value;
}

function renderMinimapSettings() {
  $('hud-size').value = minimapSettings.size;
  $('hud-opacity').value = minimapSettings.opacity;
  $('hud-corner').value = minimapSettings.corner;
  $('hud-zoom').value = minimapSettings.zoom;
  $('hud-north').checked = minimapSettings.north;
  renderGuideOptions(minimapSettings.guideQuest);
  updateSettingsLabels();
}

function applyMinimapSettings(settings) {
  const zoomChanged = minimapSettings.zoom !== settings.zoom;
  minimapSettings = settings;
  document.body.style.setProperty('--hud-size', settings.size + 'px');
  document.body.style.setProperty('--hud-opacity', settings.opacity / 100);
  if (minimap) {
    minimap.camera.invalidateSize({animate:false});
    if (zoomChanged) minimap.camera.setZoom(settings.zoom, {animate:false});
    updateMinimapBearing();
  }
}

async function loadMinimapSettings() {
  try {
    const response = await fetch('minimap-settings');
    if (!response.ok) throw Error();
    applyMinimapSettings(await response.json());
  } catch {
    $('minimap-settings-status').textContent = 'Saved settings could not be loaded.';
  }
}

async function saveMinimapSettings(event) {
  event.preventDefault();
  const save = $('save-minimap-settings');
  if (save.disabled) return;
  save.disabled = true;
  const status = $('minimap-settings-status');
  const settings = {
    size:Number($('hud-size').value), opacity:Number($('hud-opacity').value), corner:$('hud-corner').value,
    zoom:Number($('hud-zoom').value), north:$('hud-north').checked, guideQuest:$('hud-guide-quest').value,
  };
  try {
    const response = await fetch('minimap-settings', {method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify(settings)});
    if (!response.ok) throw Error();
    applyMinimapSettings(settings);
    status.textContent = 'Saved.';
  } catch {
    status.textContent = 'Could not save settings. Try again.';
  } finally {
    save.disabled = false;
  }
}

async function loadPins() {
  try {
    const response = await fetch('pins');
    if (!response.ok) throw Error();
    const saved = await response.json();
    for (const id of saved.pins) pinned.add(id);
    for (const id of saved.givers || []) giverPins.add(id);
    preferencesReady = true;
  } catch {
    $('pin-notice').textContent = 'Pin settings are unavailable.';
    $('pin-notice').hidden = false;
  }
}

async function start() {
  setOpen(opened);
  const [response, mapData] = await Promise.all([fetch('quests.json'),fetch('landmarks.json').catch(() => null)]);
  if (!response.ok) throw Error();
  const catalog = await response.json();
  if (mapData?.ok) landmarks = await mapData.json();
  explorer.setLandmarks(landmarks);
  quests = catalog.map((item,index) => ({
    ...item, number:index+1, color:colors[index % colors.length]
  }));
  quest = quests.find(item => campaignFor(item) === questCampaign);
  character.addEventListener('change', () => refresh(Number(character.value)));
  $('quest-search').addEventListener('input', event => {
    questQuery = event.target.value.trim();
    renderJournal();
  });
  const tabs = Array.from($('quest-campaigns').querySelectorAll('[data-campaign]'));
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => {
      const campaign = tab.dataset.campaign;
      if (campaign !== questCampaign) selectQuestCampaign(campaign);
    });
    tab.addEventListener('keydown', event => {
      const next = {
        ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length],
        ArrowRight: tabs[(index + 1) % tabs.length],
        Home: tabs[0],
        End: tabs.at(-1),
      }[event.key];
      if (!next) return;
      event.preventDefault();
      next.click();
      next.focus();
    });
  }
  for (const tab of document.querySelectorAll('[data-filter]')) {
    tab.addEventListener('click', () => { filter = tab.dataset.filter; renderJournal(); });
  }
  $('quests-tab').addEventListener('click', () => { preview = undefined; setView('quests'); });
  $('map-tab').addEventListener('click', () => { preview = undefined; setView('map'); });
  for (const id of ['weapons','checklist','history']) $(id + '-tab').addEventListener('click',() => setView(id));
  $('map-realm').addEventListener('change',event => {
    preview = undefined;
    switchRealm(map,event.target.value);
    drawPlayer(map,player);
    refreshMarkers();
  });
  $('endings-tab').addEventListener('click', () => setView('endings'));
  const endingPicker = $('desired-ending');
  endingPicker.replaceChildren(new Option('Select an ending', ''),
    ...Object.entries(endingRoutes).map(([id, route]) => new Option(route.name, id)));
  endingPicker.addEventListener('change', () => savePlannerPreferences({ending:endingPicker.value}));
  $('spoiler-free').addEventListener('change', event => savePlannerPreferences({spoilerFree:event.target.checked}));
  $('clear-waypoint').addEventListener('click', () => savePlannerPreferences({waypoint:null}));
  $('center-waypoint').addEventListener('click', () => setWaypoint(map.camera.getCenter()));
  $('settings-tab').addEventListener('click', () => setView('settings'));
  $('minimap-settings').addEventListener('submit', saveMinimapSettings);
  for (const id of ['hud-size', 'hud-opacity', 'hud-zoom']) $(id).addEventListener('input', updateSettingsLabels);
  $('zoom-in').addEventListener('click', () => map.camera.zoomIn());
  $('zoom-out').addEventListener('click', () => map.camera.zoomOut());
  $('locate-player').addEventListener('click', locatePlayer);
  $('mini-zoom-in').addEventListener('click', () => minimap.camera.zoomIn());
  $('mini-zoom-out').addEventListener('click', () => minimap.camera.zoomOut());
  $('mini-follow').addEventListener('click', () => setFollow(!following));
  $('remaining-pins').addEventListener('click', () => { preview = undefined; fitPreferred(refreshMarkers()); });
  $('fit-world').addEventListener('click', () => { preview = undefined; refreshMarkers(); fitPins(map, []); });
  $('close').addEventListener('click', () => window.hideOverlay?.());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') window.hideOverlay?.(); });
  window.addEventListener('focus', () => refresh());
  renderJournal();
  await Promise.all([loadPins(), loadMinimapSettings(), loadPlannerPreferences(), refresh()]);
  ready = true;
  renderJournal();
  if (view === 'settings') renderMinimapSettings();
  renderView();
  window.overlayReady?.();
  void explorer.load();
  setInterval(() => refresh(), 1800);
}

start().catch(() => { $('status').textContent = 'The quest journal could not be loaded.'; });
