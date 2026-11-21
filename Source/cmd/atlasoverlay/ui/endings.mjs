const finalBattle = {quest:'elden-throne', step:'elden-throne-10', label:'Defeat Radagon and the Elden Beast'};

export const endingRoutes = {
  fracture: {
    name:'Age of Fracture',
    tasks:[finalBattle],
    finale:'At Fractured Marika, choose “Mend the Elden Ring.”',
    warnings:[],
  },
  order: {
    name:'Age of Order',
    tasks:[
      {quest:'corhyn-goldmask',step:'corhyn-goldmask-7',label:'Tell Goldmask the secret of Radagon’s statue'},
      {quest:'corhyn-goldmask',step:'corhyn-goldmask-9',label:'Collect the Mending Rune of Perfect Order'},
      finalBattle,
    ],
    finale:'At Fractured Marika, use the Mending Rune of Perfect Order.',
    warnings:['Cast Law of Regression at Radagon’s statue and report the secret to Goldmask before defeating Maliketh.'],
  },
  duskborn: {
    name:'Age of the Duskborn',
    tasks:[
      {quest:'ranni',step:'ranni-12',label:'Finish Ranni’s route through the Cursemark of Death'},
      {quest:'fia',step:'fia-6',label:'Give Fia the Cursemark in Deeproot Depths'},
      {quest:'fia',step:'fia-8',label:'Defeat Fortissax and collect the Mending Rune of the Death-Prince'},
      finalBattle,
    ],
    finale:'At Fractured Marika, use the Mending Rune of the Death-Prince.',
    warnings:['In Deeproot Depths, choose “No, I want to be held” and keep Fia alive until she gives you her rune.'],
  },
  despair: {
    name:'Blessing of Despair',
    tasks:[
      {quest:'dung-eater',step:'dung-eater-6',label:'Give the Dung Eater five Seedbed Curses'},
      {quest:'dung-eater',step:'dung-eater-7',label:'Collect the Mending Rune of the Fell Curse'},
      finalBattle,
    ],
    finale:'At Fractured Marika, use the Mending Rune of the Fell Curse.',
    warnings:['Keep the Dung Eater alive and give him Seedbed Curses. Killing him or offering Seluvis’s Potion closes the rune route.'],
  },
  stars: {
    name:'Age of the Stars',
    tasks:[
      {quest:'ranni',step:'ranni-21',label:'Complete Ranni’s quest through the Dark Moon Ring'},
      finalBattle,
    ],
    finale:'Touch Ranni’s blue summon sign near Fractured Marika.',
    warnings:['If you offer Ranni the Amber Draught and she turns hostile, use Celestial Dew at the Church of Vows to continue her route.'],
  },
  flame: {
    name:'Lord of Frenzied Flame',
    tasks:[
      {quest:'shabriri',step:'shabriri-2',label:'Inherit the Frenzied Flame from the Three Fingers'},
      finalBattle,
    ],
    finale:'With the Frenzied Flame active, interact with Fractured Marika.',
    warnings:['Remove your armor to open the Three Fingers’ door below Leyndell. Hyetta’s quest is optional. Using Miquella’s Needle closes this ending for the current journey.'],
  },
};

export function endingWarnings(id, snapshot) {
  if (!Object.hasOwn(endingRoutes,id)) return [];
  const flags = snapshot.complete;
  const warnings = [...endingRoutes[id].warnings];
  if (flags['elden-throne-11']) warnings.unshift('An ending has already been chosen in this journey.');
  if (id === 'flame') {
    if (flags['millicent-14']) warnings.unshift('The save shows the Frenzied Flame was removed. This ending is closed for this journey.');
  } else if (flags['shabriri-2'] && !flags['millicent-14']) {
    warnings.unshift('The Frenzied Flame is active. Use Miquella’s Needle in Dragonlord Placidusax’s arena to reopen this ending.');
  } else if (!flags['millicent-14']) {
    warnings.push('Leave the Three Fingers’ seal closed to keep this ending available.');
  }
  if (id === 'order' && flags['elden-throne-7'] && snapshot.available['corhyn-goldmask-7'] &&
      !flags['corhyn-goldmask-7'] && !flags['corhyn-goldmask-9']) {
    warnings.unshift('Leyndell has changed. Check Goldmask’s route before continuing. The save lacks the Royal Capital milestone.');
  }
  return warnings;
}
