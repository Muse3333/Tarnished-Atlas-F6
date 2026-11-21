import { distanceLabel, worldOffset } from './geo.mjs';

// Conditions belong to a specific encounter. The Mountaintops and Charo’s
// Hidden Grave Death Rite Birds are available in daylight as well.
const nightLocations = {
  1036450800: ['Gate Town North', 'Search the open water just south of Gate Town North, between the small islands and sunken ruins.'],
  1036480800: ['East Raya Lucaria Gate', 'Follow Bellum Highway northeast from East Raya Lucaria Gate toward Bellum Church. The rider patrols this road.'],
  1037420800: ['Scenic Isle', 'Look for the fallen ruins just northeast of Scenic Isle in the lake.'],
  1037460800: ['Church of Vows', 'Enter the Church of Vows after speaking with Miriel. If the Hunter does not appear, rest again after nightfall.'],
  1039430800: ['Gate Town Bridge', 'Follow the road southeast from Gate Town Bridge. The rider patrols the road through the flooded ruins.'],
  1039510800: ['Altus Highway Junction', 'Follow the road southwest from Altus Highway Junction toward the Grand Lift of Dectus.'],
  1042380800: ["Warmaster's Shack", 'Head east from Warmaster’s Shack and climb onto the fallen stone ruins in the field.'],
  1042380850: ["Warmaster's Shack", 'Speak to Bernahl at Warmaster’s Shack, then return to the shack at night. Rest again if the Hunter does not appear.'],
  1043370800: ['Agheel Lake North', 'Ride southeast from Agheel Lake North to the road bridge over the river. The rider patrols the crossing.'],
  1043530800: ["Hermit Merchant's Shack", 'Return to the Hermit Merchant’s Shack in the Capital Outskirts at night. Rest at the grace again if the merchant is still there.'],
  1044320800: ['Castle Morne Rampart', 'Look for the ruined stonework on the cliffs northwest of Castle Morne. Approach the ruins to trigger the fight.'],
  1044320850: ['Castle Morne Rampart', 'Watch the main road by Castle Morne Rampart, on the approach to Castle Morne.'],
  1044530800: ["Hermit Merchant's Shack", 'Go east from the Hermit Merchant’s Shack to the cliff overlooking the Minor Erdtree. The giant snails mark the area.'],
  1048410800: ['Dragonbarrow West', 'Visit the Isolated Merchant’s Shack in western Dragonbarrow. If the merchant is still present after nightfall, rest again at the shack.'],
  1048510800: ['Forbidden Lands', 'Follow the narrow route east from the Forbidden Lands grace toward the Grand Lift of Rold.'],
  1048570800: ['Apostate Derelict', 'Head southeast of Apostate Derelict to the end of the frozen river, northwest of Ordina.'],
  1049370800: ['Caelid Highway South', 'Check the stretch of Caelid Highway south of the Swamp of Aeonia. The rider patrols near the road junction.'],
  1049370850: ['Southern Aeonia Swamp Bank', 'Cross the road east-southeast of Southern Aeonia Swamp Bank and approach the rocky clearing.'],
  1052410850: ["Lenne's Rise", 'Take the bridge north of Lenne’s Rise. This is the smaller crossing east of Farum Greatbridge.'],
  1248550800: ['Inner Consecrated Snowfield', 'Look for a carriage traveling southwest of Inner Consecrated Snowfield. Two riders escort it at night.'],
};

// Use named approaches for the major fights, triggers and rooms that are easy to miss.
const locations = {
  9100: ['Castleward Tunnel', 'Follow Castleward Tunnel to the bridge at the main approach to Stormveil Castle.'],
  9101: ['Secluded Cell', 'Enter the courtyard through the fog gate beside Secluded Cell in Stormveil Castle.'],
  9103: ['The Four Belfries', 'Fight on the cliffside beyond the Chapel of Anticipation. To return later, use the Four Belfries waygate marked Precipice of Anticipation.'],
  9104: ["Queen's Bedchamber", 'Climb the stairs above the Queen’s Bedchamber to the Elden Throne in the Royal Capital.'],
  9105: ['West Capital Rampart', 'Climb the roots in upper Leyndell to reach the Erdtree Sanctuary.'],
  9106: ['Leyndell, Capital of Ash', 'Return to the Erdtree Sanctuary after Leyndell becomes the Ashen Capital.'],
  9107: ["Queen's Bedchamber", 'Ascend from the Queen’s Bedchamber to the Elden Throne in the Ashen Capital.'],
  9108: ['Grand Cloister', 'In the Grand Cloister below the Lake of Rot, ride the coffin at the edge of the waterfall to Astel’s cavern.'],
  9109: ['Ainsel River Downstream', 'Follow lower Ainsel River past the Uhl Palace Ruins to the cavern beneath Nokstella.'],
  9110: ['Aqueduct-Facing Cliffs', 'Descend into the Siofra Aqueduct from the cliffs below Nokron and enter the basin beneath the waterfall.'],
  9111: ['Prince of Death’s Throne', 'Reach the Prince of Death’s Throne in Deeproot Depths and enter Fia’s dream when her quest opens it.'],
  9112: ['Dynasty Mausoleum Midpoint', 'Take the lift beside Dynasty Mausoleum Midpoint up to Mohg’s arena in Mohgwyn Palace.'],
  9114: ['Dragon Temple Transept', 'Enter the Dragon Temple in Crumbling Farum Azula. The Transept grace is beside a fog gate into the hall.'],
  9115: ['Beside the Great Bridge', 'Ride the lift down from Beside the Great Bridge, then descend the broken ledges and lie down in the empty grave recess.'],
  9116: ['Beside the Great Bridge', 'Follow the upper bridge in Crumbling Farum Azula to the arena at its far end.'],
  9117: ['Schoolhouse Classroom', 'Climb past the sorcerers above Schoolhouse Classroom to the academy’s Debate Parlor.'],
  9118: ['Debate Parlor', 'Cross the courtyard beyond Debate Parlor, ascend the staircase with the rolling boulder, then take the lift to the Grand Library.'],
  9119: ['Haligtree Town Plaza', 'Cross the lower walkways of Haligtree Town to the arena before the descent into Elphael.'],
  9120: ['Haligtree Roots', 'Use the fog gate beside Haligtree Roots at the bottom of Elphael.'],
  9121: ['Prison Town Church', 'Through the Volcano Manor legacy dungeon, reach the Temple of Eiglay beyond the bridge.'],
  9122: ['Audience Pathway', 'Take the tunnel from Audience Pathway into Rykard’s cavern. Tanith’s contracts or the manor’s hidden dungeon can lead there.'],
  9123: ['Elden Throne', 'After clearing the Elden Throne in the Ashen Capital, enter the Erdtree. This fight follows Radagon in the same encounter.'],
  9125: ['Forsaken Depths', 'Reach Forsaken Depths at the bottom of the Subterranean Shunning-Grounds and enter the chapel.'],
  9126: ['Ruin-Strewn Precipice Overlook', 'Climb the ladders and lifts north of Liurnia’s ravine. Enter the arena at the top of the precipice.'],
  9128: ['Stranded Graveyard', 'Use two Stonesword Keys at the imp seal in Stranded Graveyard, then descend past the chariot to the final chamber.'],
  9129: ['Subterranean Inquisition Chamber', 'Let the Abductor Virgin under Raya Lucaria take you to Volcano Manor, then follow the lower cavern to the duo.'],
  9130: ['Chamber Outside the Plaza', 'During the Radahn Festival, speak to Jerren in the plaza, then take the lift and beach waygate to the Wailing Dunes.'],
  9131: ['Foot of the Forge', 'Cross one of the chains above Foot of the Forge to enter the snowy arena beneath the Forge of the Giants.'],
  9132: ['Siofra River Bank', 'Light the eight pillars in lower Siofra River, then touch the remains at Hallowhorn Grounds.'],
  9133: ['Ancestral Woods', 'Light the six pillars around Ancestral Woods in Nokron, then touch the remains at its Hallowhorn Grounds.'],
  9134: ['Nokron, Eternal City', 'Descend through the crater opened by Radahn’s defeat. Cross Nokron’s rooftops and enter the first large arena.'],
  9135: ['Across the Roots', 'Cross the roots above the Nameless Eternal City and enter the arena beside Across the Roots.'],
  9140: ['Stagefront', 'Climb through Belurat to Stagefront and enter the upper theatre.'],
  9143: ['Divine Gate Front Staircase', 'Follow Enir-Ilim to the Divine Gate Front Staircase. The arena is at the top of the stairs.'],
  9144: ['Shadow Keep Main Gate', 'Take the entrance lift into Shadow Keep and continue from the Main Gate into the plaza.'],
  9146: ['Dark Chamber Entrance', 'Climb the Specimen Storehouse in Shadow Keep to Dark Chamber Entrance, then use the nearby fog gate.'],
  9148: ['Fissure Depths', 'Descend Stone Coffin Fissure to Fissure Depths, then jump from the stone head into the arena.'],
  9155: ['Cathedral of Manus Metyr', 'Follow Ymir’s bell quest. When his throne is vacant, open the passage beneath it and sound the third bell.'],
  9156: ['Second Floor Chamber', 'Make your way through Midra’s Manse in the Abyssal Woods. The chamber is just beyond the second-floor grace.'],
  9160: ['Church of the Bud, Main Entrance', 'Cross the Ancient Ruins of Rauh to the Church of the Bud. The arena is past the Main Entrance grace.'],
  9161: ['Darklight Catacombs', 'Descend Darklight Catacombs to the final fog gate. Defeating Jori opens the way into the Abyssal Woods.'],
  9162: ['Tree-Worship Sanctum', 'Drain the Church District in Shadow Keep, then take the lift down through Tree-Worship Passage to the Scadutree Base.'],
  9163: ['Jagged Peak Summit', 'Go through Dragon’s Pit to reach Jagged Peak and follow the spiritsprings to the Summit grace.'],
  9164: ['Shadow Keep, Back Gate', 'Reach Shadow Keep’s Back Gate from the Loft side of the Specimen Storehouse. The fight starts on the field outside.'],
  9183: ['Chamber Outside the Plaza', 'Enter the Redmane Castle plaza while the Radahn Festival is inactive. After defeating Radahn, talk to Jerren and reload the castle to restore the encounter.'],
  9190: ["Castle-Lord's Chamber", 'Follow the ramparts through Castle Ensis to the Castle-Lord’s Chamber and its upper terrace.'],
  9221: ['Black Knife Catacombs', 'Ride a falling blade to the upper passage, then strike the illusory wall at the far end to open the optional Assassin arena.'],
  9220: ['Hidden Path to the Haligtree', 'Drop onto the invisible walkway below the broken railing and follow the concealed path to the arena.'],
  1042360800: ['The First Step', 'Look for the mounted knight patrolling the road between The First Step and the Church of Elleh.'],
  1042370800: ['Stormhill Shack', 'Enter Stormhill Evergaol on the plateau above Gatefront.'],
  1037510800: ['Abandoned Coffin', 'The first encounter is near Abandoned Coffin. After the dragon flies away, look for her again on the hill south of Rampartside Path.'],
  1038520800: ['Erdtree-Gazing Hill', 'Climb the slope north of Erdtree-Gazing Hill to the flooded graveyard in Wyndham Ruins.'],
  1050570800: ['Snow Valley Ruins Overlook', 'Look on the ledge west of Snow Valley Ruins Overlook, on the cliffs above Castle Sol.'],
  1254560800: ['Freezing Lake', 'Ride onto the frozen lake from the Freezing Lake grace. The dragon approaches through the mist.'],
  2046410800: ['Gravesite Plain', 'Head west from Gravesite Plain to the Western Nameless Mausoleum. It is listed here as Knight of the Solitary Gaol.'],
  2047390800: ["Charo's Hidden Grave", 'Follow the red flower field north from the grace into the flooded graveyard. The bird appears as you approach the water.'],
  2049440800: ['Moorth Ruins', 'Pick up the Monk’s Missive and May the Best Win gesture at Highroad Cross. Use the gesture in front of Dane at Moorth Ruins to start the duel.'],
  2051450800: ['Cathedral of Manus Metyr', 'After defeating Metyr, return to Ymir’s cathedral and interact with the throne to start the final encounters.'],
};

const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

export function bossGuideApproach(id) {
  return (nightLocations[id] || locations[id])?.[0];
}

export function bossGuide(boss, landmark, dungeon) {
  const night = Boolean(nightLocations[boss.id]);
  const customLocation = (nightLocations[boss.id] || locations[boss.id])?.[1];
  const format = location => ({location, night, time:night ? 'Night only' : 'Day or night'});
  if (customLocation) return format(customLocation);
  if (dungeon) {
    const guide = landmark && landmark.name !== boss.region ? ` Nearest marked grace on the map is ${landmark.name}.` : '';
    return format(`The encounter is inside ${boss.region}.${guide}`);
  }
  if (boss.point && landmark) {
    const {distance, bearing} = worldOffset(landmark, boss.point);
    if (distance < 80) return format(`The encounter is near ${landmark.name} in ${boss.region}.`);
    const direction = directions[(Math.round(bearing / 45) + 8) % 8];
    return format(`On the map, the encounter is about ${distanceLabel(distance)} ${direction} of ${landmark.name}.`);
  }
  if (landmark && landmark.name !== boss.region) return format(`The encounter is in ${boss.region}. Start your search near ${landmark.name}.`);
  return format(`The encounter is in ${boss.region}.`);
}
