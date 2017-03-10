const DiakinAircon = require('./aircon_daikin.js');


const d = ([p1, p2]) => {
    process.stdout.write(`B64_multi ${p1.toString('base64')} ${p2.toString('base64')}`);
}


d(DiakinAircon.encode({
    power: 1,
    mode: DiakinAircon.MODE.HEATING,
    temperature: 25,
}));
