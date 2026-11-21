import { mapLayer, pointFor, SHADOW_BOUNDS, worldOffset } from './geo.mjs';
import { matchesQuestName, nextObjective } from './quest-model.mjs';
import { bossGuide, bossGuideApproach } from './boss-guide.mjs';

const $ = id => document.getElementById(id);
const stats = ['STR', 'DEX', 'INT', 'FAI', 'ARC'];
const affinities = ['Standard','Heavy','Keen','Quality','Fire','Flame Art','Lightning','Sacred','Magic','Cold','Poison','Blood','Occult'];
const sources = ['Chest','Boss / Remembrance','Merchant','Enemy drop','Defeat reward','Quest reward','Starting gear','World pickup','Unknown'];
const normalize = text => text.normalize('NFKD').replace(/\p{M}|['’]/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const bossLandmarks = {
  9100:'Castleward Tunnel', 9101:'Secluded Cell', 9103:'The First Step',
  9140:'Stagefront', 9143:'Divine Gate Front Staircase', 9144:'Shadow Keep Main Gate',
  9146:'Dark Chamber Entrance', 9148:'Fissure Depths', 9155:'Cathedral of Manus Metyr',
  9156:'Second Floor Chamber', 9160:'Church of the Bud, Main Entrance', 9161:'Darklight Catacombs',
  9162:'Tree-Worship Sanctum', 9163:'Jagged Peak Summit', 9164:'Shadow Keep, Back Gate', 9190:'Castle-Lord’s Chamber',
  9270:'Fog Rift Catacombs', 9271:'Scorpion River Catacombs',
};
const areaLandmarks = {
  'Academy of Raya Lucaria':'Main Academy Gate', 'Carian Manor':'Main Caria Manor Gate',
  'Castle Morne':'Castle Morne Lift', 'Castle Sol':'Castle Sol Main Gate',
  'Divine Tower of Caelid':'Divine Tower of Caelid: Basement',
  "Fringefolk Hero's Grave":'Stranded Graveyard',
  'Leyndell, Ashen Capital':'Leyndell, Capital of Ash', 'Leyndell, Royal Capital':'East Capital Rampart',
  'Mountaintops of the Giants':'Foot of the Forge', 'Redmane Castle':'Chamber Outside the Plaza',
  'Siofra Aqueduct':'Aqueduct-Facing Cliffs', 'Subterranean Shunning-Grounds':'Underground Roadside',
  'The Shaded Castle':'Shaded Castle Ramparts',
};
const trackedDungeons = /(?:\b(?:cave|catacombs|gaol|tunnel|forge|tomb|manse|hero.?s grave|legacy dungeon)\b|^dragon.s pit$|^hidden path to the haligtree$)/i;
const legacyDungeons = new Set(['Stormveil Castle','Academy of Raya Lucaria','Carian Manor','Volcano Manor','Leyndell, Royal Capital',
  'Crumbling Farum Azula',"Miquella's Haligtree",'Castle Morne','Castle Sol','The Shaded Castle','Redmane Castle',
  'Belurat, Tower Settlement','Castle Ensis','Shadow Keep','Enir-Ilim','Stone Coffin Fissure','Subterranean Shunning-Grounds']);
// The route starts at a nearby grace. The acquisition note identifies the chest, enemy, or NPC from there.
const weaponPlaces = {
  'Greatsword':['Caelem Ruins','Chest','Open the chest at the rear of the stopped carriage northwest of the grace.'],
  'Giant-Crusher':['Outer Wall Phantom Tree','Chest','Head south to the encampment. Open the chest in the parked carriage.'],
  'Great Stars':['Road of Iniquity Side Path','Chest','Loot the chest in the carriage traveling southwest of the grace.'],
  'Brick Hammer':['Stormveil Cliffside','World pickup','Find the corpse on the wooden ledge above the cliffside route inside Stormveil.'],
  'Large Club':['Forlorn Hound Evergaol','World pickup','Check the cliffs south of the evergaol for the corpse guarded by demi-humans.'],
  'Great Club':['Old Altus Tunnel','Defeat reward','Defeat the Stonedigger Troll at the end of the tunnel.'],
  'Claymore':['Castle Morne Lift','Chest','From the courtyard, enter the room to the right of the burning pile and open its chest.'],
  'Zweihander':['Isolated Merchant’s Shack','Merchant','Buy it from the Isolated Merchant in the western Weeping Peninsula.'],
  'Grafted Blade Greatsword':['Beside the Rampart Gaol','Defeat reward','Defeat Leonine Misbegotten on the beach below Castle Morne.'],
  'Ruins Greatsword':['Chamber Outside the Plaza','Defeat reward','Defeat the Misbegotten Warrior and Crucible Knight in Redmane Castle when the festival is inactive.'],
  'Starscourge Greatsword':['Table of Lost Grace','Boss / Remembrance','Defeat Starscourge Radahn, then exchange his Remembrance with Enia at Roundtable Hold.'],
  'Nightrider Glaive':['Bellum Church','Defeat reward','Ride south on Bellum Highway at night and defeat the Night’s Cavalry.'],
  'Executioner’s Greataxe':['Church of Irith','Enemy drop','Farm axe-wielding skeletons in the graveyard above the church.'],
  'Lordsworn’s Greatsword':['Gatefront','Chest','Open the chest in the carriage on the western side of Gatefront Ruins.'],
  'Banished Knight’s Greatsword':['Rampart Tower','Enemy drop','Farm a sword-wielding Banished Knight in Stormveil Castle.'],
  'Iron Greatsword':['Avenue Balcony','Enemy drop','Farm greatsword-wielding Misbegotten in Leyndell before the capital changes, or in the Haligtree.'],
  'Bloodhound’s Fang':['Forlorn Hound Evergaol','Defeat reward','Enter the evergaol and defeat Bloodhound Knight Darriwil.'],
  'Rivers of Blood':['Church of Repose','Defeat reward','Defeat Bloody Finger Okina near the church.'],
  'Moonveil':['Gael Tunnel','Defeat reward','Defeat the Magma Wyrm in Gael Tunnel.'],
  'Dark Moon Greatsword':['Cathedral of Manus Celes','Quest reward','Finish Ranni’s quest at the cathedral on Moonlight Altar.'],
  'Marais Executioner’s Sword':['Shaded Castle Inner Gate','Defeat reward','Defeat Elemer of the Briar in the Shaded Castle.'],
  'Blasphemous Blade':['Table of Lost Grace','Boss / Remembrance','Defeat Rykard and trade his Remembrance with Enia.'],
  'Ordovis’s Greatsword':['Auriza Hero’s Grave','Defeat reward','Clear the Crucible Knight duo in Auriza Hero’s Grave.'],
  'Dragon Halberd':['Siofra River Bank','Defeat reward','Take the waygate from the flooded ruins in Siofra River to the Dragonkin Soldier.'],
  'Prelate’s Inferno Crozier':['Seethewater Terminus','Defeat reward','Defeat the Fire Prelate at Fort Laiedd.'],
  'Troll’s Golden Sword':['Erdtree-Gazing Hill','Chest','Find the carriage in the camp east of the grace.'],
  'Great Mace':['Bellum Church','Chest','Open the chest behind the camp near the Grand Lift of Dectus.'],
  'Milady':['Castle Front','Chest','Take the ladder up the tower near the start of Castle Ensis.'],
  'Bloodfiend’s Arm':['Cliffroad Terminus','Defeat reward','Fight the Bloodfiend group in Prospect Town. The guaranteed drop is from the group above the ruined streets.'],
  'Ancient Meteoric Ore Greatsword':['Ruined Forge of Starfall Past','World pickup','Use the forge altar at the end of the dungeon.'],
  'Black Steel Greathammer':['Gravesite Plain','Defeat reward','Defeat the Black Knight at the Church of Consolation southeast of the grace.'],
  'Fire Knight’s Greatsword':['Storehouse, First Floor','Enemy drop','Farm the Fire Knight carrying this sword near the Specimen Storehouse entrance.'],
  'Devonia’s Hammer':['Viaduct Minor Tower','Defeat reward','Defeat Crucible Knight Devonia along the route into Rauh.'],
  'Dragon-Hunter’s Great Katana':['Dragon’s Pit','Defeat reward','Defeat Ancient Dragon-Man inside Dragon’s Pit.'],
  'Greatsword of Solitude':['Gravesite Plain','Defeat reward','Defeat the Blackgaol Knight in the Western Nameless Mausoleum, west of the grace.'],
  'Sword of Night':['Cathedral of Manus Metyr','Quest reward','Give Jolán the Iris of Occultation after completing Ymir’s route.'],
  'Dryleaf Arts':['Moorth Ruins','Quest reward','Use May the Best Win in front of Dryleaf Dane and defeat him in the duel.'],
  'Ansbach’s Longbow':['Storehouse, First Floor','Quest reward','Resolve the Storehouse duel involving Ansbach, when available.'],
  'Obsidian Lamina':['Gate of Divinity','Quest reward','Finish Ansbach’s quest and collect his equipment after the final boss.'],
};
const entriesByName = new Map(Object.entries(weaponPlaces).map(([name,value]) => [normalize(name),value]));

export function strongestStat(scaling, index) {
  return scaling[index] > 0 && scaling[index] === Math.max(...scaling);
}

export function broadRegion(region) {
  if (!region) return '';
  if (/^limgrave/i.test(region) || region === 'Stormveil Castle') return 'Limgrave';
  if (/^liurnia/i.test(region)) return 'Liurnia of the Lakes';
  if (region === 'Bellum Highway') return 'Liurnia of the Lakes';
  if (/^leyndell/i.test(region)) return 'Leyndell';
  if (/^mountaintops/i.test(region)) return 'Mountaintops of the Giants';
  if (/Shadow Keep|Specimen Storehouse/.test(region)) return 'Shadow Keep';
  if (/Lake of Rot|Ainsel River/.test(region)) return 'Ainsel River & Lake of Rot';
  return region;
}

export function checklistState(entry, world, dungeon) {
  if (!world) return 'Awaiting save';
  if (dungeon && !entry.bosses.length) {
    if (!entry.point?.flag || world[entry.point.flag] === undefined) return 'Clear status unavailable';
    return world[entry.point.flag] ? 'Reached' : 'Not reached';
  }
  const bosses = dungeon ? entry.bosses : [entry];
  if (bosses.some(boss => world[boss.id] === false)) return 'Unfinished';
  if (bosses.every(boss => world[boss.id] === true)) return 'Cleared';
  return 'Clear status unavailable';
}

export function questHistory(quest, saves, current) {
  const matching = new Set(quest.steps.map(step => step.id));
  const complete = {...current.complete};
  const skipped = {...current.skipped};
  const objective = () => nextObjective(quest, step => complete[step.id], step => skipped[step.id]);
  const result = new Map();
  for (const save of saves.slice().reverse()) {
    const changes = save.changes.filter(change => matching.has(change.step));
    if (!changes.length) continue;
    const after = objective();
    for (const change of changes) {
      complete[change.step] = change.before === 'completed';
      skipped[change.step] = change.before === 'unavailable';
    }
    result.set(save, {after, before:objective(), changes});
  }
  return result;
}

export function createExplorer({node, button, guide, showQuest, spoilersHidden}) {
  let landmarks = [];
  let byName = new Map();
  let weapons = [];
  let bosses = [];
  let dungeons = [];
  let currentRegion = '';
  let savedWorld;
  let loadError = false;
  let shownWeapons = 36;
  const comparisons = new Set();
  const named = name => byName.get(normalize(name || ''));
  const nearestLandmark = point => {
    if (!point) return;
    const layer = mapLayer(point);
    let nearest, distance = Infinity;
    for (const landmark of landmarks) {
      if (!landmark.region || layer !== mapLayer(landmark)) continue;
      const offset = worldOffset(point, landmark).distance;
      if (offset < distance) { distance = offset; nearest = landmark; }
    }
    return nearest;
  };
  const nearestRegion = point => broadRegion(nearestLandmark(point)?.region);
  const setFilters = (id, values) => $(id).append(...values.map(value => new Option(value,value)));
  setFilters('weapon-affinity',affinities);
  setFilters('weapon-source',sources);

  function getWeaponPoint(weapon) {
    const spelling = normalize(weapon.name);
    const preset = entriesByName.get(spelling);
    const point = preset && named(preset[0]);
    if (point) return point;
    const basedOn = (' ' + normalize(weapon.location || '') + ' ');
    return landmarks.find(mark => mark.name.length > 5 && (mark.layer === 'shadow') === Boolean(weapon.dlc) &&
      basedOn.includes(' ' + normalize(mark.name) + ' '));
  }

  function statRow(label, values) {
    const row = node('p', '', 'stat-row');
    row.append(node('span', label), ...values.map((value, index) => node('span', stats[index] + ' ' + (value < 0 ? '?' : value))));
    return row;
  }

  function renderWeapons() {
    const query = $('weapon-search').value.trim();
    const affinity = $('weapon-affinity').value;
    const source = $('weapon-source').value;
    const realm = $('weapon-realm').value;
    const build = $('weapon-build').value;
    const matches = weapons.filter(weapon => {
      const selected = weapon.stats[affinity];
      return selected && (!source || weapon.source === source) &&
        (realm === 'all' || Boolean(weapon.dlc) === (realm === 'shadow')) &&
        (build === '' || strongestStat(selected.scaling, Number(build))) &&
        (!query || matchesQuestName(weapon.name + ' ' + weapon.type + ' ' + (weapon.point?.name || '') + ' ' + (weapon.location || ''), query));
    });
    if (build !== '') matches.sort((a,b) => b.stats[affinity].scaling[Number(build)] - a.stats[affinity].scaling[Number(build)] || a.name.localeCompare(b.name));
    $('weapon-count').textContent = loadError ? 'The local weapon catalogue could not be loaded.' :
      (weapons.length ? matches.length + ' matched · +0 weapon stats · Scaling shown as raw values' : 'Loading weapons…');
    const more = $('weapon-more');
    more.hidden = matches.length <= shownWeapons;
    $('weapon-results').replaceChildren(...matches.slice(0,shownWeapons).map(weapon => {
      const card = node('article', '', 'catalogue-card');
      const selected = weapon.stats[affinity];
      const name = node('h3', weapon.name);
      const meta = node('p', [weapon.type, weapon.dlc && 'DLC', weapon.source].filter(Boolean).join(' · '), 'stage-info');
      const guideBtn = button('Guide me there', () => guide(weapon.point, weapon.name + ' · near ' + weapon.point.name));
      guideBtn.disabled = !weapon.point;
      const compare = button(comparisons.has(weapon.id) ? 'Remove comparison' : 'Compare', () => {
        if (comparisons.has(weapon.id)) comparisons.delete(weapon.id);
        else if (comparisons.size < 3) comparisons.add(weapon.id);
        renderWeapons();
      });
      compare.disabled = comparisons.size >= 3 && !comparisons.has(weapon.id);
      const actions = node('div','','catalogue-actions');
      actions.append(guideBtn, compare);
      if (weapon.point) actions.append(node('span','Near ' + weapon.point.name,'stage-info'));
      else actions.append(node('span','Waypoint unavailable','stage-info'));
      card.append(name, meta, statRow('Requires', selected.requirements), statRow('Scaling', selected.scaling),
        node('p', weapon.location || 'Acquisition details unavailable.', 'weapon-location'), actions);
      return card;
    }));
    const compareBox = $('weapon-compare');
    compareBox.hidden = !comparisons.size;
    compareBox.replaceChildren();
    if (!comparisons.size) return;
    const table = node('table');
    const heading = node('tr');
    heading.append(node('th',affinity + ' +0'));
    const selected = Array.from(comparisons).map(id => weapons.find(weapon => weapon.id === id));
    for (const weapon of selected) {
      const th = node('th',weapon.name);
      th.append(button('Remove', () => { comparisons.delete(weapon.id); renderWeapons(); }, 'subtle'));
      heading.append(th);
    }
    const header = node('thead'); header.append(heading);
    const body = node('tbody');
    for (const [index, stat] of stats.entries()) {
      const row = node('tr'); row.append(node('th', stat));
      for (const weapon of selected) {
        const values = weapon.stats[affinity];
        const value = values?.scaling[index];
        row.append(node('td', values ? 'Req. ' + values.requirements[index] + ' · Scale ' + (value < 0 ? '?' : value) : 'Unavailable'));
      }
      body.append(row);
    }
    table.append(header,body); compareBox.append(node('h3','Compare weapons'),table);
  }

  function renderChecklist() {
    const query = $('checklist-search').value.trim();
    const isDungeon = $('checklist-kind').value === 'dungeons';
    const chosen = $('checklist-region').value;
    const status = $('checklist-status').value;
    const region = chosen === 'current' ? currentRegion : chosen;
    const list = (isDungeon ? dungeons : bosses).filter(item => (!region || region === 'all' || item.zone === region) &&
      (!query || matchesQuestName([item.name,item.region,item.location].filter(Boolean).join(' '), query)));
    const rows = list.map(item => ({item, state:checklistState(item,savedWorld,isDungeon)}));
    const shown = rows.filter(row => status === 'all' || (status === 'complete' ? row.state === 'Cleared' : ['Unfinished','Not reached'].includes(row.state)));
    const summary = rows.filter(row => row.state === 'Cleared').length + ' cleared · ' + rows.filter(row => row.state === 'Unfinished').length + ' unfinished';
    const regionLabel = region && region !== 'all' ? region + ' · ' : '';
    $('checklist-count').textContent = loadError ? 'The local checklist could not be loaded.' : !bosses.length ? 'Loading checklist…' :
      regionLabel + (savedWorld ? summary : 'Select your saved character to see cleared encounters.') + (chosen === 'current' && !currentRegion ? ' · Waiting for live region' : '');
    $('checklist-results').replaceChildren(...shown.map(({item,state}) => {
      const row = node('article', '', 'catalogue-card checklist-row');
      const left = node('div');
      const details = node('p',isDungeon ? item.zone : item.region,'stage-info');
      left.append(node('h3',item.name),details);
      if (!isDungeon) {
        const time = node('span',item.time,'boss-time' + (item.night ? ' night' : ''));
        if (item.night) time.title = 'At a Site of Grace, choose Pass time → Until nightfall.';
        details.append(' · ',time);
      }
      const right = node('div','','catalogue-actions');
      right.append(node('span',state,'check-state' + (state === 'Cleared' ? ' cleared' : '')));
      if (item.point) right.append(button('Guide me there',() => guide(item.point,item.point.encounter ? item.name : item.name + ' · near ' + item.point.name)));
      row.append(left,right);
      if (!isDungeon) row.append(node('p',item.location,'boss-location'));
      if (isDungeon && item.bosses.length) row.append(node('p',item.bosses.map(boss => boss.name).join(' · '),'stage-info'));
      return row;
    }));
    if (bosses.length && !shown.length) $('checklist-results').append(node('p','No encounters match these filters.','stage-info'));
  }

  function renderHistory(snapshot, quests) {
    const target = $('history-results');
    const saves = snapshot.history || [];
    target.replaceChildren();
    if (!saves.length) {
      target.append(node('p', snapshot.slot ? 'Waiting for your next saved quest change.' : 'Select your saved character to see quest history.', 'stage-info'));
      return;
    }
    const all = quests.map(quest => ({quest, records:questHistory(quest,saves,snapshot)}));
    for (const save of saves.slice().reverse()) {
      const batch = node('article','','catalogue-card history-batch');
      const time = new Date(save.time);
      batch.append(node('h3',time.toLocaleString()));
      for (const {quest,records} of all) {
        const record = records.get(save);
        if (!record) continue;
        const group = node('section');
        group.append(button(quest.name, () => showQuest(quest), 'subtle'));
        if (spoilersHidden(quest)) {
          group.append(node('p', record.changes.length + ' saved ' + (record.changes.length === 1 ? 'change' : 'changes') + ' · Open the quest to reveal details.', 'stage-info'));
        } else {
          for (const change of record.changes) {
            const step = quest.steps.find(step => step.id === change.step);
            const label = {completed:'Completed', unavailable:'Became unavailable', remaining:'Returned to remaining'}[change.after];
            group.append(node('p', label + ' · ' + step.title),node('p',change.reason,'stage-info'));
          }
          if (record.before !== record.after) group.append(node('p', record.after ? 'Next · ' + record.after.title + ' · ' + record.after.place : 'Main route complete.', 'history-next'));
        }
        batch.append(group);
      }
      if (batch.children.length > 1) target.append(batch);
    }
  }

  for (const id of ['weapon-search','weapon-build','weapon-affinity','weapon-source','weapon-realm']) {
    $(id).addEventListener('input', () => { shownWeapons = 36; renderWeapons(); });
  }
  $('weapon-more').addEventListener('click', () => { shownWeapons += 36; renderWeapons(); });
  for (const id of ['checklist-search','checklist-region','checklist-kind','checklist-status']) $(id).addEventListener('input',renderChecklist);

  function setCatalogue(payload) {
    weapons = payload.weapons.map(weapon => {
      const preset = entriesByName.get(normalize(weapon.name));
      return {...weapon, point:getWeaponPoint(weapon), source:preset?.[1] || weapon.source, location:preset?.[2] || weapon.location};
    }).sort((a,b) => a.name.localeCompare(b.name));
    bosses = payload.bosses.map(boss => {
      const corrected = boss.id === 9161 ? 'Darklight Catacombs' : boss.region;
      const inDungeon = trackedDungeons.test(corrected) || legacyDungeons.has(corrected);
      const namedLandmark = named(bossGuideApproach(boss.id)) || named(bossLandmarks[boss.id] || areaLandmarks[corrected] || corrected);
      const nearest = nearestLandmark(boss.point);
      const landmark = namedLandmark || nearest ||
        landmarks.find(point => point.region === corrected);
      const point = boss.point ? {...boss.point,name:boss.name,encounter:true} : landmark;
      const guideLocation = inDungeon ? landmark : nearest || landmark;
      const notes = bossGuide({...boss,region:corrected},guideLocation,inDungeon);
      return {...boss, region:corrected, point, zone:broadRegion(nearest?.region || landmark?.region || corrected), ...notes};
    });
    const grouped = new Map();
    const dungeonEntry = (name, region, point) => ({name, region, point, zone:broadRegion(point?.region || region), bosses:[]});
    const dungeonKey = name => normalize(name).replace('fogrift','fog rift');
    for (const point of landmarks) if (trackedDungeons.test(point.name)) grouped.set(dungeonKey(point.name),dungeonEntry(point.name,point.region,point));
    for (const boss of bosses) {
      if (!trackedDungeons.test(boss.region) && !legacyDungeons.has(boss.region)) continue;
      const key = dungeonKey(boss.region);
      if (!grouped.has(key)) grouped.set(key,dungeonEntry(boss.region,boss.region,boss.point));
      grouped.get(key).bosses.push(boss);
    }
    dungeons = Array.from(grouped.values()).sort((a,b) => a.name.localeCompare(b.name));
    setFilters('checklist-region',Array.from(new Set([...bosses,...dungeons].map(item => item.zone).filter(Boolean))).sort());
  }

  return {
    setLandmarks(data) {
      landmarks = data.slice().sort((a,b) => b.name.length - a.name.length);
      byName = new Map(landmarks.map(point => [normalize(point.name),point]));
    },
    async load() {
      try {
        const response = await fetch('explore');
        if (!response.ok) throw Error();
        setCatalogue(await response.json());
      } catch { loadError = true; }
      renderWeapons(); renderChecklist();
    },
    draw(view, snapshot, quests, player) {
      if (view === 'weapons') renderWeapons();
      if (view === 'history') renderHistory(snapshot,quests);
      if (view === 'checklist') {
        currentRegion = nearestRegion(player);
        savedWorld = snapshot.world;
        renderChecklist();
      }
    },
    updateRegion(point) {
      const next = nearestRegion(point);
      if (next !== currentRegion) { currentRegion = next; renderChecklist(); }
    },
  };
}

export function makeShadowChart(L, landmarks, mini, node, guide) {
  const group = L.layerGroup();
  const canvas = L.canvas({padding:.5});
  const shadow = landmarks.filter(mark => mark.layer === 'shadow');
  const outline = L.latLngBounds(SHADOW_BOUNDS);
  const line = {renderer:canvas, interactive:false, weight:1, color:'#76735e', opacity:.18};
  L.rectangle(outline, {...line, fill:true, fillColor:'#202921', fillOpacity:1}).addTo(group);
  for (let lat = .15; lat <= .39; lat += .01) L.polyline([[lat,1.84],[lat,2.06]],line).addTo(group);
  for (let lng = 1.84; lng <= 2.061; lng += .01) L.polyline([[.15,lng],[.39,lng]],line).addTo(group);
  const names = ['Gravesite Plain','Scadu Altus','Ancient Ruins of Rauh','Jagged Peak','Cerulean Coast','Abyssal Woods','Scaduview','Enir-Ilim'];
  for (const [index,name] of names.entries()) {
    const locations = shadow.filter(mark => mark.region === name);
    if (!locations.length) continue;
    const center = L.latLngBounds(locations.map(pointFor)).getCenter();
    const radius = Math.max(255,...locations.map(mark => worldOffset(center,mark).distance)) * 1.12;
    L.circle(center,{renderer:canvas,radius:radius * (40075017 / (2 ** 23)),interactive:false,weight:1,color:'#b8a274',opacity:.24,
      fillColor:['#6b6740','#625335','#6c6a42','#654a39','#485a61','#69503c','#526044','#715746'][index],fillOpacity:.53}).addTo(group);
    if (!mini) {
      const icon = L.divIcon({className:'shadow-region-label',html:node('span',name),iconSize:[115,18],iconAnchor:[57,9]});
      L.marker(center,{icon,interactive:false,keyboard:false,zIndexOffset:-1000}).addTo(group);
    }
  }
  for (const mark of shadow) {
    const spot = L.circleMarker(pointFor(mark),{renderer:canvas,radius:mini ? 2.5 : 3.5,weight:1,color:'#ecd47f',
      fillColor:'#a38143', fillOpacity:.9,interactive:!mini}).addTo(group);
    if (!mini) {
      const popup = node('div','','pin-details');
      popup.append(node('strong',mark.name),node('p',mark.region,'stage-info'),buttonForMap(mark));
      spot.bindPopup(popup);
    }
  }
  return group;

  function buttonForMap(mark) {
    const control = node('button','Guide me there');
    control.type = 'button';
    control.addEventListener('click',() => guide(mark,mark.name));
    return control;
  }
}
