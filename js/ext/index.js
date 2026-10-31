// Extension modules of 『八尺様 ― 境の夜』: the ONLY place for this game's code (docs/standard-3d.md in game-kit).
//   hasshaku.js   her look (standard character + hat), replacing the monster pack's person look
//   village.js    the village, the house and the people dressed on top of the standard world
//   story.js      the five stages: conversations, the night in the sealed room, the van to the border, death and the ending
//   minigames.js  the salt heap and the gate's three turn-buttons; sound.js the synthesized sounds
import { installLook } from './hasshaku.js';
import story from './story.js';

export default function (ext) {
  installLook();
  story(ext);
}
