const fs = require('fs');

const NUM_POINTS = 30;
const SITE_SIZE = 100; // 100m x 100m
let csv = 'Easting,Northing,Elevation\n';

for (let i = 0; i < NUM_POINTS; i++) {
    // Random distribution in plan
    const x = Math.random() * SITE_SIZE;
    const y = Math.random() * SITE_SIZE;

    // 1. Base elevation (e.g., around 100m at South, Y=0)
    // 2. Dip towards the North: Decrease Z as Y increases (-0.2m per m)
    const regionalDip = 100 - (0.2 * y);

    // 3. East-West Channel: a depression running along X, centered at Y=50 
    //    We'll use a Gaussian curve to simulate a channel that's 15m deep and ~20m wide
    const channelDepth = 15;
    const channelWidthSq = 200; // variance defining the width
    const channelDepression = channelDepth * Math.exp(-Math.pow(y - 50, 2) / channelWidthSq);

    // 4. Minor random natural noise (+/- 1m)
    const noise = (Math.random() * 2) - 1;

    const z = regionalDip - channelDepression + noise;

    csv += `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}\n`;
}

fs.writeFileSync('test_data_channel.csv', csv);
console.log('Saved 30 points to test_data_channel.csv');
