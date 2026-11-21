export const missableRules = [
  {
    id:'rogier-knifeprint', quest:'rogier', ready:['ranni-2'], deadline:['ranni-3'], reward:['rogier-6'],
    action:'Examine the Black Knifeprint with Rogier before entering Ranni’s service.',
    passed:'Ranni’s service has begun. Rogier’s earlier investigation dialogue may be unavailable.',
  },
  {
    id:'seluvis-charm', quest:'seluvis', ready:['ranni-10'], deadline:['ranni-11'], reward:['seluvis-charm'],
    action:'Give Seluvis the Amber Starlight and collect the Magic Scorpion Charm before handing Ranni the Fingerslayer Blade.',
    passed:'The Fingerslayer Blade has been handed over. The save has no record of receiving the Magic Scorpion Charm this journey.',
  },
  {
    id:'latenna-recruit', quest:'latenna-albus', ready:['latenna-albus-1'], deadline:['latenna-albus-3'],
    reward:['latenna-albus-2','latenna-albus-4'],
    action:'Recruit Latenna at the Slumbering Wolf’s Shack before taking the second medallion half at Castle Sol.',
    passed:'The second medallion half has been collected. Check Latenna’s shack if you have yet to recruit her.',
  },
  {
    id:'tanith-contract', quest:'tanith', ready:['tanith-1'], deadline:['tanith-5'], reward:['tanith-4'],
    action:'Take the remaining contracts and claim their rewards before killing Rykard.',
    passed:'Rykard is dead. Outstanding assignments may still be playable if you already took their letters.',
  },
  {
    id:'patches-whip', quest:'patches', ready:['tanith-2'], deadline:['tanith-5'], reward:['patches-7'],
    action:'Finish Patches’ Great Horned Tragoth request and collect the Magma Whip Candlestick before killing Rykard.',
    passed:'Rykard is dead. Check Patches for any remaining contract or reward dialogue.',
  },
  {
    id:'bernahl-contract', quest:'bernahl', ready:['tanith-3','elden-throne-6'], deadline:['tanith-5','elden-throne-7'],
    reward:['bernahl-3'],
    action:'Get Bernahl’s letter and help defeat Vargram and Wilhelm in Leyndell before fighting Rykard or Maliketh.',
    passed:'Rykard or Maliketh is dead. Check whether Bernahl’s Leyndell assignment is still available.',
  },
  {
    id:'goldmask-secret', quest:'corhyn-goldmask', ready:['elden-throne-3','elden-throne-6'], deadline:['elden-throne-7'],
    reward:['corhyn-goldmask-7','corhyn-goldmask-9'],
    action:'Use Law of Regression at Radagon’s statue and report the secret to Goldmask before killing Maliketh.',
    passed:'Leyndell has changed. The Royal Capital step for Goldmask can no longer be done there.',
  },
  {
    id:'ansbach-sealing-tree', quest:'dlc-ansbach', ready:['dlc-rellana','dlc-romina'], deadline:['dlc-enirilim'],
    reward:['dlc-ansbach-letter','dlc-ansbach-reward'], allowManual:true,
    action:'Finish Ansbach’s scroll and Freyja dialogue in the Storehouse before burning the Sealing Tree.',
    passed:'Your save has reached Enir-Ilim. Check whether Ansbach’s Storehouse route is still available.',
  },
  {
    id:'freyja-letter', quest:'dlc-freyja', ready:['dlc-rellana','dlc-romina'], deadline:['dlc-enirilim'],
    reward:['dlc-freyja-shield'], allowManual:true,
    action:'Discuss Freyja with Ansbach before giving him the Secret Rite Scroll, then deliver his letter before burning the tree.',
    passed:'Your save has reached Enir-Ilim. Check whether the letter and shield can still be collected.',
  },
  {
    id:'leda-duels', quest:'dlc-leda', ready:['dlc-rellana'], deadline:['dlc-enirilim'],
    reward:['dlc-leda-ansbach','dlc-leda-sword'], allowManual:true,
    action:'Check for Leda’s invasion signs in Shadow Keep before opening Enir-Ilim. The duel rewards depend on which side you choose.',
    passed:'Your save has reached Enir-Ilim. The earlier Shadow Keep duels may have closed.',
  },
  {
    id:'grandam-start', quest:'dlc-grandam', ready:['dlc-grandam-head'], deadline:['dlc-messmer'],
    reward:['dlc-grandam-reward'], allowManual:true,
    action:'Bring the Divine Beast Head to Grandam before defeating Messmer.',
    passed:'Messmer has been defeated. Check Grandam’s room for any dialogue and rewards you can still collect.',
  },
  {
    id:'moore-syrup', quest:'dlc-moore', ready:['dlc-entry'], deadline:['dlc-enirilim'],
    reward:['dlc-moore-deliver'], allowManual:true,
    action:'Give Thiollier the Black Syrup before resolving Moore’s fate or proceeding to Enir-Ilim.',
    passed:'Your save has reached Enir-Ilim. Moore’s earlier Black Syrup handoff may no longer be available.',
  },
  {
    id:'thiollier-sealing-tree', quest:'dlc-thiollier', ready:['dlc-thiollier-knight','dlc-romina'], deadline:['dlc-enirilim'],
    reward:['dlc-thiollier-trina','dlc-thiollier-reward'], allowManual:true,
    action:'Finish the St. Trina dialogue and Thiollier’s challenge before burning the Sealing Tree to secure his help.',
    passed:'Your save has reached Enir-Ilim. Check the Fissure to see whether Thiollier’s earlier steps are still available.',
  },
  {
    id:'igon-summon', quest:'dlc-igon', ready:['dlc-entry'], deadline:['dlc-igon-bayle'],
    reward:['dlc-igon-finger','dlc-igon-gear'], allowManual:true,
    action:'Collect Igon’s finger before you fight Bayle if you want to summon him.',
    passed:'Bayle has been defeated. You can no longer use Igon’s sign for that fight in this journey.',
  },
  {
    id:'priestess-potion', quest:'dlc-priestess', ready:['dlc-entry'], deadline:['dlc-igon-bayle'],
    reward:['dlc-priestess-choice','dlc-priestess-claim'], allowManual:true,
    action:'For Florissax’s alternate rewards, give her Thiollier’s Concoction at night before defeating Bayle.',
    passed:'Bayle has been defeated. If you already gave her the concoction, return to the altar to finish the conversation.',
  },
];

export function missableAlerts(snapshot, isMarked = () => false) {
  if (!snapshot.slot) return [];
  const completed = id => snapshot.complete[id] || isMarked(id);
  const result = [];
  for (const rule of missableRules) {
    if (rule.reward.some(completed) || (!rule.allowManual && !rule.reward.some(id => snapshot.available[id]))) continue;
    const passed = rule.deadline.some(id => snapshot.complete[id]);
    if (passed || rule.ready.some(id => snapshot.complete[id])) result.push({...rule, deadlinePassed:passed});
  }
  return result;
}
