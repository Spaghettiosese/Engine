// Chapter list, in play order. Chapters load on demand.
const lazy = (file, fn) => async (g) => (await import(file))[fn](g);
export const CHAPTERS = [
  { id: 'tape', title: 'TAPE 01 · DEVLOG 14', run: lazy('./tape.js', 'chapterTape') },
  { id: 'school', title: '1 · LAST BELL', run: lazy('./school.js', 'chapterSchool') },
  { id: 'drive', title: '2 · THE DRIVE HOME', run: lazy('./car.js', 'chapterDrive') },
  { id: 'home', title: '3 · HOME', run: lazy('./home.js', 'chapterHome') },
  { id: 'mc', title: '4 · ASK ME ANYTHING', run: lazy('./blockworld.js', 'chapterBlock') },
  { id: 'static', title: '5 · STATIC', run: lazy('./static.js', 'chapterStatic') },
  { id: 'dark', title: '6 · LIGHTS OUT', run: lazy('./dark.js', 'chapterDark') },
  { id: 'memory', title: '7 · JULY 14', run: lazy('./memory.js', 'chapterMemory') },
  { id: 'truth', title: '8 · THE TRUTH', run: lazy('./truth.js', 'chapterTruth') },
];
