const WIND_SPEED = {
    auto:   0,
    quiet:  2,
    weak:   3,
    strong: 5,
};

// wind_direction: 0 = auto, 1 = topmost, 5 = downmost

const MODE = {
    heating: 1,
    dry:     2,
    cooling: 3,
};

const DRY_INTENSITY = {
    standard: 0,
    weak:     1,
    strong:   3,
};

const defaultCommand = {
    header:           Buffer.from("I8smAQA=", 'base64'),
    padding1:         1,
    timer_mode:       0,
    on:               0,
    padding2:         0,
    padding3:         0,
    dry_intensity:    0,
    mode:             MODE.heating,
    padding4:         0,
    temperature:      13, // 18 degrees
    is_timer_command: 0,
    wind_direction:   0,
    wind_speed:       0,
    timer_value:      0,
    padding5:         0,
    padding6:         0,
    cool_feeling:     0,
    padding7:         0,
    padding8:         0,
};

const checksum = (buffer, offset, length) => {
    const end = offset + length;
    let c = 0;
    for (let i = offset; i < end; i++) {
        c = (c + buffer.readUInt8(i)) & 0xff;
    }
    return c;
};

const encode = (options) => {
    let temperature = 31 - options.temperature;
    return encodeRaw(
        Object.assign({},
                      defaultCommand,
                      options,
                      { temperature }));
};

const encodeRaw = (c) => {
    console.log(`encoding raw options ${JSON.stringify(c)}`);

    const buffer = Buffer.alloc(14);
    c.header.copy(buffer);

    const byte1 = (c.padding1 << 5) |
                  (c.timer_mode << 3) |
                  (c.on << 2) |
                  c.padding2;
    buffer.writeUInt8(byte1, 5);

    const byte2 = (c.padding3 << 4) |
                  (c.dry_intensity << 2) |
                  (c.mode);
    buffer.writeUInt8(byte2, 6);

    const byte3 = (c.padding4 << 4) |
                  (c.temperature);
    buffer.writeUInt8(byte3, 7);

    const byte4 = (c.is_timer_command << 6) |
                  (c.wind_direction << 3) |
                  (c.wind_speed);
    buffer.writeUInt8(byte4, 8);

    buffer.writeUInt8(c.timer_value, 9);

    buffer.writeUInt8(c.padding5, 10);

    const byte5 = (c.padding6 << 6) |
                  (c.cool_feeling << 5) |
                  (c.padding7);

    buffer.writeUInt8(byte5, 11);

    buffer.writeUInt8(c.padding8, 12);

    buffer.writeUInt8(checksum(buffer, 0, 13), 13);

    return buffer;
}

module.exports = {
    encode,
    WIND_SPEED,
    MODE,
    DRY_INTENSITY,
};
