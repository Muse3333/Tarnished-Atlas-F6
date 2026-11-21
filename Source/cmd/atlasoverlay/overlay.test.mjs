import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catchUp, mapGroups, matchesQuestName, nextObjective, questState, remainingObjectives, saveIdentity, skippedObjective } from './ui/quest-model.mjs';
import { insideWorld, interpolatePlayer, pointFor, markerDiameter, navigationTarget, nearbyObjectives, worldOffset } from './ui/geo.mjs';
import { missableAlerts, missableRules } from './ui/missables.mjs';
import { endingRoutes, endingWarnings } from './ui/endings.mjs';
import { navigationPlan } from './ui/travel.mjs';
import { checklistState, questHistory, strongestStat } from './ui/explore.mjs';
import { bossGuide, bossGuideApproach } from './ui/boss-guide.mjs';

const previousPlayer = {lat:0, lng:0, heading:10, cameraHeading:179};
const nextPlayer = {lat:2, lng:4, heading:50, cameraHeading:-179};
assert.deepEqual(interpolatePlayer(previousPlayer, nextPlayer, .5),
  {lat:1, lng:2, heading:30, cameraHeading:180});
assert.equal(interpolatePlayer(nextPlayer, previousPlayer, .5).cameraHeading, -180);
assert.equal(interpolatePlayer({lat:0, lng:0, heading:350}, {lat:0, lng:0, heading:10}, .5).heading, 360);

const quests = JSON.parse(readFileSync(new URL('./ui/quests.json', import.meta.url)));
const stageRules = JSON.parse(readFileSync(new URL('./rules.json', import.meta.url)));
assert.equal(Object.keys(endingRoutes).length, 6);
for (const route of Object.values(endingRoutes)) {
  for (const task of route.tasks) {
    assert.ok(quests.find(quest => quest.id === task.quest)?.steps.some(step => step.id === task.step), task.step);
  }
}
const flameActive = {complete:{'shabriri-2':true},available:{}};
assert.match(endingWarnings('stars',flameActive)[0],/Frenzied Flame is active/);
const flameRemoved = {complete:{'shabriri-2':true,'millicent-14':true},available:{}};
assert.match(endingWarnings('flame',flameRemoved)[0],/closed for this journey/);
assert.ok(!endingWarnings('stars',flameRemoved).some(warning => warning.includes('is active')));
assert.ok(matchesQuestName('White Mask Varré', 'varre white'));
assert.ok(matchesQuestName('Jar-Bairn', '  JAR-BAIRN  '));
assert.ok(!matchesQuestName('Preceptor Seluvis', 'Amber Starlight'));
const playerPosition = {lat:.7, lng:-.8, underground:false};
const east = {lat:playerPosition.lat, lng:playerPosition.lng + 360 / 2 ** 23, place:'Surface'};
const eastOffset = worldOffset(playerPosition, east);
assert.ok(Math.abs(eastOffset.distance - 1) < 1e-9);
assert.equal(eastOffset.bearing, 90);
const far = {quest:{id:'far'}, anchor:{...east,lng:-.75}};
const near = {quest:{id:'near'}, anchor:east};
const hold = {quest:{id:'hold'}, anchor:{...east,place:'Gideon · Roundtable Hold'}};
const beneath = {quest:{id:'beneath'}, anchor:{...east,lat:.4,place:'Ainsel River'}};
assert.equal(navigationTarget(playerPosition, [far,hold,near,beneath], '').quest.id, 'near');
assert.equal(navigationTarget(playerPosition, [near,far], 'far').quest.id, 'far');
assert.equal(navigationTarget(playerPosition, [beneath,hold], ''), undefined);
assert.equal(navigationTarget({...playerPosition,lat:.39,underground:true}, [near,beneath], '').quest.id, 'beneath');
assert.ok(insideWorld(east));
assert.ok(!insideWorld({lat:2,lng:0}));
const unfinished = [
  {id:'far', next:far.anchor}, {id:'near',next:near.anchor},
  {id:'complete'}, {id:'other layer',next:beneath.anchor},
];
assert.deepEqual(nearbyObjectives(playerPosition,unfinished,quest => quest.next,step => step).map(item => item.quest.id), ['near','far']);
assert.deepEqual(nearbyObjectives(null,unfinished,quest => quest.next,step => step), []);
assert.equal(navigationPlan(playerPosition,[], '',east,{}).title,'Custom waypoint');
const river = {quest:{id:'ranni',name:'Ranni'},step:{title:'Find Blaidd'},
  anchor:{lat:.2780284,lng:-.6709845,place:'Siofra River · Underground'}};
const riverPlan = navigationPlan(playerPosition,[river],'ranni',null,{});
assert.equal(riverPlan.passage.label,'Siofra River Well');
assert.ok(riverPlan.distance > 0 && Number.isFinite(riverPlan.bearing));
const nokron = {...river.anchor,lat:.28513,lng:-.68388,place:'Night’s Sacred Ground · Nokron'};
assert.equal(navigationPlan(playerPosition,[river],'ranni',nokron,{}).distance,undefined);
assert.equal(navigationPlan(playerPosition,[river],'ranni',nokron,{'ranni-8':true}).passage.label,'Mistwood crater');
const ainsel = {lat:.39256,lng:-.77660,place:'Ainsel River Main · Underground'};
assert.equal(navigationPlan(playerPosition,[],'',ainsel,{'ranni-11':true}).passage.label,'Renna’s Rise waygate');
const palace = {lat:.28566,lng:-.64762,place:'Mohgwyn Palace'};
assert.equal(navigationPlan(playerPosition,[],'',palace,{'varre-medal':true}).passage.label,'Pureblood Knight’s Medal');
assert.equal(navigationPlan(playerPosition,[],'',palace,{'latenna-albus-1':true,'latenna-albus-3':true}).passage.label,'Consecrated Snowfield waygate');
const deeproot = {lat:.44035,lng:-.70105,place:'Fia’s Champions · Deeproot Depths'};
assert.equal(navigationPlan({...nokron,underground:true},[],'',deeproot,{'ranni-8':true}).passage.label,'Great Waterfall Basin');
assert.match(navigationPlan({...deeproot,underground:true},[],'',ainsel,{}).passage.label,/Coffin/);
assert.equal(navigationPlan({...ainsel,underground:true},[],'',{lat:.67905,lng:-.80191,place:'Cathedral of Manus Celes · Liurnia'},
  {'ranni-19':true,'ranni-17':true}).passage.label,'Lift to Moonlight Altar');
console.log('Waypoint priority, nearby objectives, cross-layer transfers, and ending routes passed.');
for (const rule of missableRules) {
  assert.ok(quests.some(quest => quest.id === rule.quest), rule.id);
  for (const id of [...rule.ready, ...rule.deadline]) assert.ok(stageRules[id], id);
  for (const id of rule.reward) assert.ok(stageRules[id] || rule.allowManual && quests.some(quest => quest.steps.some(step => step.id === id && step.manual)), id);
}
const trackedSave = {slot:1, available:{'seluvis-charm':true}, complete:{'ranni-10':true}};
assert.equal(missableAlerts(trackedSave)[0].deadlinePassed, false);
const afterHandover = {...trackedSave, complete:{...trackedSave.complete,'ranni-11':true}};
assert.equal(missableAlerts(afterHandover)[0].deadlinePassed, true);
assert.equal(missableAlerts({...afterHandover,complete:{...afterHandover.complete,'seluvis-charm':true}}).length, 0);
assert.equal(missableAlerts({...afterHandover,available:{}}).length, 0);
assert.equal(missableAlerts({...afterHandover,slot:0}).length, 0);
console.log('Quest-name search, objective distances and map layers, and save-based missable alerts passed.');

const ranni = quests.find(quest => quest.id === 'ranni');
assert.equal(nextObjective(ranni, () => false).sourceId, 167799);
const afterElleh = nextObjective(ranni, step => step.id === 'ranni-1');
assert.equal(afterElleh.id, 'ranni-3');
assert.equal(afterElleh.sourceId, 166221);
assert.deepEqual(pointFor(afterElleh), [0.76966489123724, -0.81658244133027]);
assert.equal(nextObjective(ranni, step => step.id === 'ranni-3').id, 'ranni-8');

const thops = quests.find(quest => quest.id === 'thops');
const spareKey = nextObjective(thops, step => ['thops-1','thops-2','thops-3'].includes(step.id));
assert.equal(spareKey.sourceId, 165842);
assert.deepEqual(pointFor(spareKey), [0.71772426787098, -0.80801948904931]);
assert.ok(markerDiameter(12.5) > markerDiameter(15.5));
assert.ok(markerDiameter(15.5) > markerDiameter(17));
console.log('Ranni’s Rise, Thops’s spare key, and marker scale checks passed.');

const varre = quests.find(quest => quest.id === 'varre');
const savedProgress = new Set(['varre-rune','varre-enia']);
const isDone = step => savedProgress.has(step.id);
const findStep = id => varre.steps.find(step => step.id === 'varre-' + id);
const party = [ranni, thops, varre];
const tracked = new Set(['varre', 'thops']);
const grouped = (loc = step => step) => mapGroups(party, tracked, isDone, loc);
const current = quest => grouped().find(group => group.objectives.some(item => item.quest === quest));
const plotted = quest => grouped().flatMap(group => group.objectives.filter(item => item.quest === quest));
assert.equal(nextObjective(varre, isDone).id, 'varre-fingers');
assert.equal(current(varre).anchor.sourceId, 166244);
assert.ok(skippedObjective(varre, findStep('meet'), isDone));
assert.ok(!isDone(findStep('meet')));
assert.equal(plotted(varre).length, 1);
assert.equal(plotted(thops).length, 1);
assert.equal(plotted(ranni).length, 1);
assert.equal(plotted(ranni)[0].tracked, false);
assert.deepEqual(current(ranni).anchor, ranni.giver);
const thopsStart = current(thops).anchor;
savedProgress.add('varre-fingers');
assert.equal(plotted(varre)[0].step.id, 'varre-trial');
assert.equal(current(varre).anchor.sourceId, 196316);
assert.deepEqual(current(thops).anchor, thopsStart);
savedProgress.add('varre-trial');
assert.equal(plotted(varre)[0].step.id, 'varre-favor');
assert.equal(current(varre).anchor.sourceId, 166244);
savedProgress.add('varre-favor');
const blood = plotted(varre)[0].step;
assert.equal(blood.id, 'varre-blood');
assert.equal(plotted(varre).length, 1);
const alternate = blood.alternates[0];
const pickAlternate = grouped(step => step === blood ? alternate : step);
assert.deepEqual(pickAlternate.find(group => group.objectives.some(item => item.quest === varre)).anchor, alternate);
tracked.delete('varre');
assert.equal(plotted(varre)[0].tracked, false);
assert.equal(plotted(varre)[0].step, blood);
tracked.add('varre');
for (const step of varre.steps.filter(step => !step.optional)) savedProgress.add(step.id);
assert.equal(nextObjective(varre, isDone), undefined);
assert.deepEqual(remainingObjectives(varre, isDone).map(step => step.id), ['varre-note']);
assert.equal(plotted(varre).length, 0);
console.log('Current marker advances after saved progress, uses one alternate location, and clears on completion.');

const shared = {...thops, id:'synthetic-overlap'};
const overlapping = mapGroups([thops,shared],new Set(['thops','synthetic-overlap']),() => false,step => step);
assert.equal(overlapping.length,1);
assert.deepEqual(overlapping[0].objectives.map(item => item.quest.id),['thops','synthetic-overlap']);
const selected = mapGroups([ranni],new Set(),() => false,step => step,{preview:{quest:ranni}});
assert.equal(selected.length,1);
assert.equal(selected[0].objectives[0].focused,true);
assert.equal(selected[0].objectives[0].tracked,false);
assert.equal(selected[0].anchor.sourceId,167799);
console.log('Shared locations, unpinned discovery and current-objective preview passed.');

const catalogIds = new Set();
for (const entry of quests) {
  assert.ok(!catalogIds.has(entry.id));
  assert.ok(entry.region && Number.isFinite(entry.giver.lat) && Number.isFinite(entry.giver.lng));
  assert.ok(entry.description?.trim(), entry.id + ' needs a description');
  assert.ok(entry.warning?.trim(), entry.id + ' needs a warning');
  assert.ok(entry.notes.length >= (entry.dlc ? 1 : 2), entry.id + ' needs quest notes');
  assert.ok(entry.notes.every(note => note.label.trim() && note.text.trim()), entry.id + ' has an empty quest note');
  catalogIds.add(entry.id);
}
const endingNames = ['Age of Fracture','Age of Order','Age of the Duskborn','Blessing of Despair','Age of the Stars','Lord of Frenzied Flame'];
const throne = quests.find(quest => quest.id === 'elden-throne');
assert.deepEqual(throne.notes.slice(-6).map(note => note.label), endingNames.map(name => name + ' ending'));
for (const name of endingNames) assert.ok(throne.description.includes(name));
for (const [id, ending] of [
  ['corhyn-goldmask', 'Age of Order'],
  ['fia', 'Age of the Duskborn'],
  ['dung-eater', 'Blessing of Despair'],
  ['ranni', 'Age of the Stars'],
  ['hyetta', 'Lord of Frenzied Flame'],
  ['shabriri', 'Lord of Frenzied Flame'],
]) {
  assert.ok(quests.find(entry => entry.id === id).description.includes(ending + ' ending'), id);
}
assert.match(quests.find(entry => entry.id === 'dung-eater').warning, /Blessing of Despair ending/);
assert.ok(quests.length >= 40);
const millicent = quests.find(q => q.id === 'millicent');
const stages = new Set();
const done = step => stages.has(step.id);
assert.equal(questState(millicent, done), 'not-started');
stages.add(millicent.steps[0].id);
assert.equal(questState(millicent, done), 'in-progress');
const giverPinned = mapGroups([millicent], new Set(), done, step => step, {giverPins:new Set(['millicent'])});
assert.deepEqual(giverPinned.flatMap(group => group.givers), [millicent]);
assert.equal(giverPinned.flatMap(group => group.objectives).length, 1);
stages.add(millicent.steps.find(step => step.title === 'Or challenge Millicent').id);
assert.equal(questState(millicent, done), 'completed');
assert.equal(remainingObjectives(millicent, done).length, 0);
assert.equal(nextObjective(millicent, done), undefined);
console.log('Base-game catalogue, progress filters, independent givers and alternate endings passed.');

const before = { profile:'fixture', slot:2, characters:[{name:'Fixture',slot:2,cycle:0}], available:{'thops-1':true} };
assert.ok(saveIdentity(before));
assert.notEqual(saveIdentity(before),saveIdentity({...before,characters:[{name:'Fixture',slot:2,cycle:1}]}));
assert.equal(saveIdentity({...before,available:{}}),'');
const observed = new Set(['varre-meet']);
const updates = catchUp([thops,varre],observed,{'varre-meet':true,'thops-1':true,'thops-2':true,'varre-trial':true});
assert.deepEqual(updates.map(({quest,steps})=>[quest.id,steps.map(step=>step.id)]),[['thops',['thops-1','thops-2']],['varre',['varre-trial']]]);
assert.deepEqual(catchUp([thops,varre],observed,{'thops-1':true,'varre-trial':true}),[]);
console.log('Save profile identity and deduplicated quest updates passed.');

const allMapped = mapGroups(quests,new Set(),() => false,step => step);
const mappedIDs = new Set(allMapped.flatMap(group => group.objectives.map(item => item.quest.id)));
assert.deepEqual(mappedIDs, catalogIds);
assert.equal(allMapped.flatMap(group => group.objectives).length, quests.length);
console.log(`All ${quests.length} quests have one starting map entry.`);

const shadow = quests.find(quest => quest.id === 'dlc-shadow');
assert.equal(quests.filter(quest => quest.dlc).length, 15);
assert.ok(quests.filter(quest => quest.dlc).every(quest => quest.steps.every(step => insideWorld(step) && step.layer === 'shadow')));
assert.equal(navigationPlan(playerPosition, [], '', shadow.giver, {}).passage.label, 'Enter the Realm of Shadow');
assert.equal(navigationPlan(shadow.giver, [], '', playerPosition, {}).passage.label, 'Return to the Lands Between');
const shadowWaypoint = {...shadow.steps[1], label:'Find Rellana'};
assert.equal(navigationPlan(shadow.giver, [], '', shadowWaypoint, {}).title, 'Find Rellana');
assert.ok(navigationPlan(shadow.giver, [], '', shadowWaypoint, {}).distance > 0);
assert.ok(missableAlerts({slot:1, available:{}, complete:{'dlc-enirilim':true}}).some(alert => alert.quest === 'dlc-freyja' && alert.deadlinePassed));
assert.ok(strongestStat([61,18,0,0,0],0));
assert.ok(!strongestStat([61,18,0,0,0],1));
assert.equal(checklistState({bosses:[{id:9146},{id:9144}]},{9146:true,9144:false},true),'Unfinished');
assert.equal(checklistState({bosses:[{id:9146},{id:9144}]},{9146:true,9144:true},true),'Cleared');
assert.equal(checklistState({bosses:[],point:{flag:123}},{123:true},true),'Reached');
const bossCatalog = JSON.parse(readFileSync(new URL('./boss_ids.json', import.meta.url)));
const findBoss = id => bossCatalog.find(boss => boss.id === id);
assert.equal(bossGuideApproach(1043370800), 'Agheel Lake North');
assert.equal(bossGuide(findBoss(1043370800), null, false).time, 'Night only');
assert.match(bossGuide(findBoss(1037460800), null, false).location,/Church of Vows.*rest again/);
assert.equal(bossGuide(findBoss(1048570800), null, false).night, true);
assert.equal(bossGuide(findBoss(1050570800), null, false).time, 'Day or night');
assert.equal(bossGuide(findBoss(2047390800), null, false).time, 'Day or night');
assert.match(bossGuide({id:1,region:'Limgrave',point:{lat:.6,lng:-.7}},{name:'An example grace',lat:.6,lng:-.71},false).location,/east of An example grace/);
assert.ok(bossCatalog.every(boss => bossGuide(boss, null, false).location.trim()));
const saveChange = {time:'2026-11-21T00:00:00Z',changes:[{step:'dlc-entry',before:'remaining',after:'completed'}]};
const routeChange = questHistory(shadow,[saveChange],{complete:{'dlc-entry':true}}).get(saveChange);
assert.equal(routeChange.before.id,'dlc-entry');
assert.equal(routeChange.after.id,'dlc-rellana');
console.log('Shadow Realm guidance, DLC quest alerts, weapon filters, checklist, and objective history passed.');

const patches = quests.find(quest => quest.id === 'patches');
const patchesDone = new Set(['patches-1','patches-2']);
const patchesSkipped = new Set();
const isPatchesDone = step => patchesDone.has(step.id);
const isPatchesUnavailable = step => patchesSkipped.has(step.id);
const patchesPinned = new Set(['patches']);
const viewPatches = preview => mapGroups([patches], patchesPinned, isPatchesDone, step => step, {
  isUnavailable:isPatchesUnavailable, preview
});
const expectPatches = (id, sourceId) => {
  const groups = viewPatches();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].objectives[0].step.id, id);
  assert.equal(groups[0].anchor.sourceId, sourceId);
};
expectPatches('patches-3', 166734);
patchesSkipped.add('patches-3');
expectPatches('patches-4', 169057);
patchesSkipped.add('patches-4');
expectPatches('patches-5', 175962);
for (const step of ['patches-5','patches-6','patches-7']) patchesSkipped.add(step);
expectPatches('patches-post-rykard', 175962);
patchesDone.add('patches-post-rykard');
expectPatches('patches-8', 175930);
patchesDone.add('patches-8');
expectPatches('patches-10', 164504);
const routeGroups = viewPatches({quest:patches, all:true});
assert.deepEqual(routeGroups.flatMap(group => group.viewedSteps).map(item => item.number).sort((a,b) => a-b),
  patches.steps.map((_, index) => index + 1));
assert.equal(routeGroups.flatMap(group => group.objectives).length, 1);
const previewStep = patches.steps.find(step => step.id === 'patches-4');
const pastView = viewPatches({quest:patches, step:previewStep});
assert.equal(pastView.find(group => group.viewedSteps.some(item => item.step === previewStep)).anchor.sourceId, 169057);
patchesDone.add('patches-10');
assert.deepEqual(viewPatches(), []);
assert.equal(viewPatches({quest:patches, all:true}).flatMap(group => group.viewedSteps).length, patches.steps.length);
console.log('Patches advances from Scenic Isle through the correct areas. All steps can still be inspected.');

const alexander = quests.find(quest => quest.id === 'alexander');
const alexanderPins = new Set(['alexander']);
const expectAlexander = (complete, skipped, id, sourceId) => {
  const isDone = step => complete.includes(step.id);
  const isUnavailable = step => skipped.includes(step.id);
  const groups = mapGroups([alexander], alexanderPins, isDone, step => step, {isUnavailable});
  assert.equal(groups.length, 1);
  assert.equal(groups[0].objectives[0].step.id, id);
  assert.equal(groups[0].anchor.sourceId, sourceId);
};
expectAlexander([], [], 'alexander-1', 164117);
expectAlexander(['alexander-1'], [], 'alexander-2', 165129);
expectAlexander(['alexander-1','alexander-2'], [], 'alexander-3', 168095);
expectAlexander(['alexander-1'], ['alexander-2'], 'alexander-3', 168095);
expectAlexander(['alexander-1'], ['alexander-2','alexander-3'], 'alexander-4', 169067);
expectAlexander(['alexander-1','alexander-4'], ['alexander-2','alexander-3'], 'alexander-5', 168542);
expectAlexander(['alexander-1','alexander-4'], ['alexander-2','alexander-3','alexander-5'], 'alexander-6', 167816);
console.log('Alexander guides each available encounter and skips only stages the save shows were missed.');
