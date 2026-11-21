const never = () => false;

export function matchesQuestName(name, query) {
  const normalize = value => value.normalize('NFKD').replace(/\p{M}|['’]/gu, '').toLowerCase();
  const normalizedName = normalize(name);
  return normalize(query).trim().split(/\s+/).every(word => normalizedName.includes(word));
}

export function skippedObjective(quest, step, isDone, isUnavailable = never) {
  if (isUnavailable(step)) return true;
  const completedAt = quest.steps.findIndex(other => other.terminal && isDone(other));
  if (completedAt !== -1 && (!step.optional || quest.steps.indexOf(step) < completedAt)) return true;
  return !!step.skipWhen && quest.steps.some(other => other.id === step.skipWhen && isDone(other));
}

export function questState(quest, isDone, isUnavailable = never) {
  const required = quest.steps.filter(step => !step.optional);
  if (quest.steps.some(step => step.terminal && isDone(step)) ||
      required.every(step => isDone(step) || skippedObjective(quest, step, isDone, isUnavailable))) return 'completed';
  return quest.steps.some(isDone) || isUnavailable(quest.steps[0]) ? 'in-progress' : 'not-started';
}

export function remainingObjectives(quest, isDone, isUnavailable = never) {
  return quest.steps.filter(step => !isDone(step) && !skippedObjective(quest, step, isDone, isUnavailable));
}

export function nextObjective(quest, isDone, isUnavailable = never) {
  const ranniJoined = quest.steps.some(step => step.id === 'ranni-3' && isDone(step));
  return remainingObjectives(quest, isDone, isUnavailable).find(step => {
    if (step.id === 'ranni-1') return !ranniJoined;
    return !step.optional || step.guideOptional;
  });
}

export function mapGroups(quests, pinned, isDone, locationFor, {giverPins = new Set(), isUnavailable = never, preview} = {}) {
  const byPoint = new Map();
  function groupAt(anchor) {
    const key = anchor.lat + ',' + anchor.lng;
    if (!byPoint.has(key)) byPoint.set(key, {anchor, objectives:[], givers:[], viewedSteps:[]});
    return byPoint.get(key);
  }
  for (const quest of quests) {
    if (giverPins.has(quest.id) && quest.giver) groupAt(quest.giver).givers.push(quest);
    const step = nextObjective(quest, isDone, isUnavailable);
    if (!step) continue;
    const tracked = pinned.has(quest.id);
    const focused = quest === preview?.quest && !preview.giver && !preview.step && !preview.all;
    const showGiver = !tracked && !focused && !quest.steps.some(isDone) && !isUnavailable(quest.steps[0]);
    const anchor = (showGiver && quest.giver) || locationFor(step);
    groupAt(anchor).objectives.push({quest, step, tracked, focused});
  }
  if (preview && !preview.giver) {
    const {quest} = preview;
    const steps = preview.all ? quest.steps : preview.step ? [preview.step] : [];
    for (const step of steps) {
      groupAt(locationFor(step)).viewedSteps.push({quest, step, number:quest.steps.indexOf(step) + 1});
    }
  }
  return Array.from(byPoint.values());
}

export function saveIdentity(snapshot) {
  const character = snapshot.characters?.find(item => item.slot === snapshot.slot);
  if (!character || !snapshot.profile || !Object.values(snapshot.available).some(Boolean)) return '';
  return JSON.stringify([snapshot.profile, character.slot, character.name, character.cycle]);
}

export function catchUp(quests, alreadySeen, complete) {
  const updates = [];
  for (const quest of quests) {
    const steps = quest.steps.filter(step => complete[step.id] && !alreadySeen.has(step.id));
    if (!steps.length) continue;
    for (const step of steps) alreadySeen.add(step.id);
    updates.push({ quest, steps });
  }
  return updates;
}
