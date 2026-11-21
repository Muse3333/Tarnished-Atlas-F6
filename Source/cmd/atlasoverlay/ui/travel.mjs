import { mapLayer, navigationTarget, worldOffset } from './geo.mjs';

// Well and waygate positions come from the Fextralife map, fitted to Atlas
// coordinates using native Site of Grace positions. Underground stops use the
// matching Elden Ring Compass grace positions or the existing Atlas catalog.
const stops = {
  siofraWell: {lat:.6265022,lng:-.6876430},
  siofraBottom: {lat:.2738480,lng:-.6959483},
  ainselWell: {lat:.7283654,lng:-.7650344},
  ainselBottom: {lat:.3763171,lng:-.7736913},
  crater: {lat:.6155658554,lng:-.6936836243},
  renna: {lat:.7771098263,lng:-.8094132985},
  gargoyles: {lat:.3057214,lng:-.6771380},
  snowfieldGate: {lat:.8331981,lng:-.6739611},
  astelLift: {lat:.3183785335,lng:-.8222051237},
  proscription: {lat:.7837714967,lng:-.6844905676},
  namelessCity: {lat:.4327191,lng:-.7151269},
};

const ainselWellGraces = [stops.ainselBottom, {lat:.37198,lng:-.7820}, {lat:.37615,lng:-.79168}, {lat:.38581,lng:-.79577}];
const ainselMainGraces = [{lat:.39230,lng:-.77657}, {lat:.38403,lng:-.78962},
  {lat:.38731,lng:-.80135}, {lat:.37816,lng:-.80467}, {lat:.35825,lng:-.80851}, stops.astelLift];
const siofraGraces = [stops.siofraBottom, {lat:.27825,lng:-.68093}, {lat:.28896,lng:-.66628}, {lat:.30390,lng:-.66282}];
const nokronGraces = [stops.gargoyles, {lat:.29919,lng:-.67763}, {lat:.28667,lng:-.68444},
  {lat:.27685,lng:-.69759}, {lat:.27339,lng:-.68445}, {lat:.27952,lng:-.68716}, {lat:.28513,lng:-.68388}];

function undergroundRegion(point) {
  const place = point.place || '';
  const distanceTo = graces => Math.min(...graces.map(grace => worldOffset(point,grace).distance));
  if (/Mohgwyn|Dynasty Mausoleum/.test(place) || (point.lng > -.658 && point.lat < .33)) return 'mohgwyn';
  if (/Deeproot|Across the Roots/.test(place) || (point.lat >= .412 && point.lng >= -.743)) return 'deeproot';
  if (/Well Depths|Ainsel River Downstream|Ainsel River Sluice Gate|Dragonkin Soldier of Nokstella/.test(place) && point.lng < -.74) return 'ainsel-lower';
  if (/Ainsel River Main|Nokstella Waterfall|Grand Cloister|Lake of Rot|Astel/.test(place)) return 'ainsel-main';
  if (point.lng < -.74) {
    return distanceTo(ainselWellGraces) < distanceTo(ainselMainGraces) ? 'ainsel-lower' : 'ainsel-main';
  }
  if (/Nokron|Siofra Aqueduct|Night.s Sacred Ground/.test(place)) return 'nokron';
  if (/Siofra River/.test(place)) return 'siofra';
  return distanceTo(siofraGraces) < distanceTo(nokronGraces) ? 'siofra' : 'nokron';
}

function transfer(from, to, flags) {
  const there = mapLayer(to);
  const here = mapLayer(from);
  if (there === 'shadow' && here === 'shadow') return undefined;
  if (here === 'shadow') return {label:'Return to the Lands Between',detail:'Switch to the Lands Between on the in-game map and fast travel to an unlocked Site of Grace near the destination.'};
  if (there === 'shadow') return {label:'Enter the Realm of Shadow',detail:'Defeat Starscourge Radahn and Mohg, Lord of Blood, then touch the withered arm in Mohgwyn Palace. If you already entered, switch maps and fast travel to a DLC grace.'};
  if (there === 'hold') {
    return here === 'hold' ? undefined : {label:'Roundtable Hold',detail:'Open the game map and travel to the Table of Lost Grace once Melina has invited you.'};
  }
  if (here === 'hold') return {label:'Leave Roundtable Hold',detail:'Fast travel to an unlocked grace to leave Roundtable Hold.'};
  if (here === 'surface' && there === 'surface') return undefined;

  const origin = here === 'underground' ? undergroundRegion(from) : '';
  const destination = there === 'underground' ? undergroundRegion(to) : '';
  if (here === 'underground' && there === 'surface') {
    if (origin === 'siofra' && from.lat < .292) return {anchor:stops.siofraBottom,label:'Siofra River Well lift',detail:'Return to the lift by Siofra River Well Depths and ride it up to Mistwood.'};
    if (origin === 'ainsel-lower') return {anchor:stops.ainselBottom,label:'Ainsel River Well lift',detail:'Return to the well lift to reach eastern Liurnia.'};
    if (origin === 'ainsel-main' && /Moonlight Altar|Manus Celes|Moonfolk Ruins|Lunar Estate Ruins/.test(to.place || '') && flags['ranni-19'] && flags['ranni-17']) {
      return {anchor:stops.astelLift,label:'Lift to Moonlight Altar',detail:'Use the Dark Moon Ring to pass the seal beyond Astel and take the lift up.'};
    }
    return {label:'Travel to the surface',detail:'Fast travel from the game map to an unlocked surface Site of Grace.'};
  }
  if (here === 'underground') {
    if (origin === 'deeproot' && destination === 'ainsel-main') {
      return {anchor:stops.namelessCity,label:'Coffin near the Nameless Eternal City',detail:'From the Nameless Eternal City grace, look for the coffin on the southwestern shore. It leads to Ainsel River Main.'};
    }
    if (destination === 'deeproot' && origin === 'nokron' && flags['ranni-8']) {
      return {anchor:stops.gargoyles,label:'Great Waterfall Basin',detail:'Reach the basin via the Siofra Aqueduct, defeat the Valiant Gargoyles, then use the coffin at the waterfall.'};
    }
    if (destination === 'mohgwyn' && origin !== destination && flags['varre-medal']) {
      return {label:'Pureblood Knight’s Medal',detail:'Use the medal from your inventory to travel to Mohgwyn Palace.'};
    }
    if (origin === 'ainsel-lower' && destination === 'ainsel-main') {
      return {anchor:stops.ainselBottom,label:'Ainsel River Well lift',detail:'Take the lift back to eastern Liurnia, then use the waygate at Renna’s Rise into upper Ainsel River.'};
    }
    if (origin === 'siofra' && /^(nokron|deeproot)$/.test(destination)) {
      return {anchor:stops.siofraBottom,label:'Siofra River Well lift',detail:'Return to Mistwood by the well lift, then enter the crater opened by Radahn’s defeat.'};
    }
    if ((origin === 'mohgwyn' && origin !== destination) ||
        (destination === 'mohgwyn' && origin !== destination)) {
      return {label:'Switch underground areas',detail:'Fast travel to an unlocked grace near the destination, or return to the surface to use its entrance.'};
    }
    return undefined;
  }

  switch (destination) {
    case 'nokron':
      return flags['ranni-8'] ? {anchor:stops.crater,label:'Mistwood crater',detail:'Descend through the crater opened by Radahn’s defeat to reach Nokron.'}
        : {label:'Defeat Starscourge Radahn',detail:'Radahn’s defeat opens the Mistwood crater entrance to Nokron.'};
    case 'siofra':
      return {anchor:stops.siofraWell,label:'Siofra River Well',detail:'Take the well lift in Mistwood down to Siofra River.'};
    case 'ainsel-lower':
      return {anchor:stops.ainselWell,label:'Ainsel River Well',detail:'Take the well lift in eastern Liurnia down to lower Ainsel River.'};
    case 'ainsel-main':
      return flags['ranni-11'] || flags['ranni-13'] ? {anchor:stops.renna,label:'Renna’s Rise waygate',detail:'Use the waygate at the top of Renna’s Rise to reach Ainsel River Main.'}
        : {label:'Unlock Renna’s Rise',detail:'Hand the Fingerslayer Blade to Ranni to open access to the waygate to Ainsel River Main.'};
    case 'deeproot':
      if (flags['hyetta-7']) return {anchor:stops.proscription,label:'Hidden path to Deeproot',detail:'At the Frenzied Flame Proscription, open the hidden passage by the chest to reach Deeproot Depths.'};
      if (flags['ranni-8']) return {anchor:stops.crater,label:'Mistwood crater',detail:'Enter Nokron through the crater, then head for the coffin at Great Waterfall Basin beyond the Valiant Gargoyles.'};
      return {label:'Unlock the route to Deeproot',detail:'Defeat Radahn to open the Nokron route, or reach Deeproot via the hidden passage below Leyndell.'};
    case 'mohgwyn':
      if (flags['varre-medal']) return {label:'Pureblood Knight’s Medal',detail:'Use the medal from your inventory to travel to Mohgwyn Palace.'};
      if (flags['latenna-albus-1'] && flags['latenna-albus-3']) return {anchor:stops.snowfieldGate,label:'Consecrated Snowfield waygate',detail:'Use the waygate in the western Snowfield. Clear the nearby Sanguine Noble invasion if the gate is inactive.'};
      return {label:'Unlock Mohgwyn Palace',detail:'Earn Varré’s Pureblood Knight’s Medal or use the waygate in the western Consecrated Snowfield.'};
  }
}

export function navigationPlan(origin, targets, preferredQuest, waypoint, flags) {
  if (!origin) return undefined;
  const here = mapLayer(origin);
  const chosen = waypoint ? {anchor:waypoint,title:waypoint.label || 'Custom waypoint',color:'#87e3d3'}
    : targets.find(target => target.quest.id === preferredQuest) ||
      (here === 'hold' ? targets.find(target => mapLayer(target.anchor) === 'hold') : navigationTarget(origin,targets,''));
  const build = target => {
    const passage = transfer(origin,target.anchor,flags);
    const anchor = passage ? passage.anchor : target.anchor;
    const offset = anchor && here !== 'hold' ? worldOffset(origin,anchor) : {};
    return {title:target.title || target.quest.name + ' · ' + target.step.title,
      color:target.color || target.quest.color, passage, ...offset};
  };
  if (chosen) return build(chosen);
  // With no direct objective, prefer the nearest available transfer.
  let best;
  for (const target of targets) {
    const plan = build(target);
    if (!best || (plan.distance ?? Infinity) < (best.distance ?? Infinity)) best = plan;
  }
  return best;
}
