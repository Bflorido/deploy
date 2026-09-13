const fs = require('fs');
let c = fs.readFileSync('js/console.js', 'utf8');

// Fix 1: spawnToast - escape msg in innerHTML (line 507 only, not line 2350)
// Match the specific context in spawnToast function
let count1 = 0;
c = c.replace(
  /function spawnToast\(msg\)[\s\S]*?\.pbody" style="font-size:12px;">\+msg\+'/,
  (match) => {
    count1++;
    return match.replace(/\+msg\+'/, "+esc(msg)+'");
  }
);
console.log('spawnToast replacements:', count1);

// Fix 2: soonClick - escape name in innerHTML (lines 500, 502 only, not line 1575 which uses textContent)
let count2 = 0;
c = c.replace(
  /function soonClick\(name\)[\s\S]*?creative quarantine\.\<\/div\>\<\/div\>/,
  (match) => {
    count2++;
    return match
      .replace(/\+name\+'/g, "+esc(name)+'")
      .replace(/\+name\+"/g, "+esc(name)+\"");
  }
);
console.log('soonClick replacements:', count2);

// Fix 3: getWeeklyEpoch - !isNaN(epoch) -> isNaN(epoch)
let count3 = 0;
c = c.replace(/if\(!isNaN\(epoch\)/g, () => { count3++; return 'if(isNaN(epoch)'; });
console.log('getWeeklyEpoch fixes:', count3);

// Fix 4: devtools detection - add !isTouch condition
let count4 = 0;
c = c.replace(/if\(\(widthDiff\|\|heightDiff\)&&!devtoolsDetected\)\{/g, () => { count4++; return 'if(!isTouch&&(widthDiff||heightDiff)&&!devtoolsDetected){'; });
console.log('devtools fixes:', count4);

fs.writeFileSync('js/console.js', c, 'utf8');
console.log('Total changes:', count1 + count2 + count3 + count4);
