const fs = require('fs');

// Process js/console.js
let js = fs.readFileSync('js/console.js', 'utf8');

// 1. Change function names
js = js.replace(/function openNaves\(\)/g, 'function openShips()');
js = js.replace(/function closeNaves\(\)/g, 'function closeShips()');

// 2. Change function calls in strings (e.g., in action:'openNaves()')
js = js.replace(/'openNaves\(\)'/g, "'openShips()'");
js = js.replace(/"openNaves\(\)"/g, '"openShips()"');
js = js.replace(/toggleStart\(\)openNaves\(\);/g, 'toggleStart()openShips();');
js = js.replace(/toggleStart\(\)openShips\(\);/g, 'toggleStart()openShips();'); // in case it was already changed

// 3. Change div id
js = js.replace(/getElementById\('navesGame'\)/g, "getElementById('shipsGame')");
js = js.replace(/getElementById\("navesGame"\)/g, 'getElementById("shipsGame")');

// 4. Change visible text "naves.exe" to "ships.exe" in strings (but not in comments or code that we don't want to change)
// We'll be careful: we want to change the label and the text in messages, but not in the function names we just changed.
// We'll do a global replace for the string "naves.exe" and hope it doesn't break anything.
// Since we changed the function names, the only remaining occurrences should be in strings and text.
js = js.replace(/naves\.exe/g, 'ships.exe');

// Write back
fs.writeFileSync('js/console.js', js, 'utf8');
console.log('JS file updated');

// Process console.html
let html = fs.readFileSync('console.html', 'utf8');

// 1. Change the function calls in ondblclick and onclick
html = html.replace(/ondblclick="openNaves\(\)"/g, 'ondblclick="openShips()"');
html = html.replace(/onclick="toggleStart\(\)openNaves\(\);"*/g, 'onclick="toggleStart()openShips();"');

// 2. Change the div id for the game
html = html.replace(/id='navesGame'/g, "id='shipsGame'");
html = html.replace(/id="navesGame"/g, 'id="shipsGame"');

// 3. Change visible text "naves.exe" to "ships.exe"
html = html.replace(/naves\.exe/g, 'ships.exe');

fs.writeFileSync('console.html', html, 'utf8');
console.log('HTML file updated');