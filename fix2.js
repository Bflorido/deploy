const fs = require('fs');
let c = fs.readFileSync('js/console.js', 'utf8');

// Fix 1: spawnToast - replace the specific line in the function
let count1 = 0;
c = c.replace(
  /(function spawnToast\(msg\)[\s\S]*?\.pbody" style="font-size:12px;">)\+msg\+/,
  (match, p1) => {
    count1++;
    return p1 + "+esc(msg)+";
  }
);
console.log('spawnToast replacements:', count1);

// Fix 2: soonClick - replace the two occurrences in the function
let count2 = 0;
c = c.replace(
  /(function soonClick\(name\)[\s\S]*?<div class="title-bar purple"><span>🚧)\+name\+(\"[\s\S]*?creative quarantine\.)/,
  (match, p1, p2) => {
    count2++;
    return p1 + "+esc(name)+" + p2;
  }
);
console.log('soonClick title replacements:', count2);

// Fix 3: getWeeklyEpoch - fix !isNaN(epoch) to isNaN(epoch)
let count3 = 0;
c = c.replace(/if\(!isNaN\(epoch\)/g, () => { count3++; return 'if(isNaN(epoch)'; });
console.log('getWeeklyEpoch fixes:', count3);

// Fix 4: devtools detection - add !isTouch condition
let count4 = 0;
c = c.replace(/if\(\(widthDiff\|\|heightDiff\)&&!devtoolsDetected\)\{/g, () => { count4++; return 'if(!isTouch&&(widthDiff||heightDiff)&&!devtoolsDetected){'; });
console.log('devtools fixes:', count4);

fs.writeFileSync('js/console.js', c, 'utf8');
console.log('Total changes:', count1 + count2 + count3 + count4);