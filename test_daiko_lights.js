const DaikoLights = require('./daiko_lights');

// Enumerates possible commands emitting the base64 encoded form can
// be decoded with code from the irdump repository, which isn't
// publically available.

const d = (buffer) => {
    const b64 = buffer.toString('base64');
    // decoder assumes two packets, since the remote always transmits
    // twice.
    const packet = `B64_multi ${b64} ${b64}\n`;
    process.stdout.write(packet);
}

const walk = (lights) => {
    d(lights.off());
    d(lights.toggle());
    d(lights.white());
    d(lights.full());
    d(lights.warm());

    for (let intensity = 1; intensity <= 10; intensity++) {
        d(lights.nightLight(intensity));
    }

    for (let warmth = 1; warmth <= 11; warmth++) {
        for (let brightness = 1; brightness <= 11; brightness++) {
            d(lights.on(warmth, brightness));
        }
    }
}

[
    new DaikoLights(DaikoLights.CHANNELS.ONE),
    new DaikoLights(DaikoLights.CHANNELS.TWO),
].forEach(walk);
