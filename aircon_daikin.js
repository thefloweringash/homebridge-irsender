const checksum = (buffer, offset, length) => {
    const end = offset + length;
    let c = 0;
    for (let i = offset; i < end; i++) {
        c = (c + buffer[i]) & 0xff;
    }
    return c;
};

const MODE = {
    AUTO: 0,
    COOLING: 3,
    HEATING: 4,
    DRY: 2,
    SENDOFF_WIND: 6,
};

const encodeTimers = (on_timer, off_timer) => {
    let on_timer_low = 0; // 8 bits
    let on_timer_high = 0; // 3 bits
    let off_timer_low = 0; // 1 bit
    let off_timer_high = 0; // 7 bits
    if (on_timer) {
	on_timer_low = on_timer & 0xff;
	on_timer_high = (on_timer >> 8) & 0x7;
    }
    else {
	on_timer_high = (3 << 1);
    }
    if (off_timer) {
	off_timer_low = off_timer & 0xf;
	off_timer_high = (off_timer >> 4) & 0x7f;
    }
    else {
	off_timer_high = (3 << 5);
    }
    
    const buf = Buffer.alloc(3);
    buf[0] = on_timer_low;
    buf[1] = (off_timer_low << 4 | on_timer_high);
    buf[2] = (off_timer_high);
    return buf;
}

const defaultPacket1 = {
    static: Buffer.from([17, 218, 39, 0, 2, 0, 0, 0, 0, 0, 0, 0]),
    fan_yonder: 0,
    rest: Buffer.from([0, 0, 0, 0, 0, 0]),
};

const defaultPacket2 = {
    static: Buffer.from([17, 218, 39, 0, 0]),
    padding1: 0,
    mode: MODE.AUTO,
    padding2: 1,
    off_timer_set: 0,
    on_timer_set: 0,
    power: 0,
    temperature: 18 * 2,
    padding3: 0,
    fan_speed: 3,
    vane_direction: 15,
    left_right: 0,
    padding4: 0,
    timers: encodeTimers(null, null),
    padding5: 0,
    silent: 0,
    padding6: 0,
    powerful_mode: 0,
    intelligent_on: 0,
    padding7: 0,
    padding8: 195,
    rest: Buffer.from([0, 0]),
};

const encodeP1Raw = (p1) => {
    const buffer = Buffer.alloc(20);
    p1.static.copy(buffer);
    buffer[12] = p1.fan_yonder;
    p1.rest.copy(buffer, 13);
    buffer[19] = checksum(buffer, 0, 19);
    return buffer;
};

const encodeP2Raw = (p2) => {
    const buffer = Buffer.alloc(19);
    p2.static.copy(buffer);
    buffer[5] = 
	(p2.padding1 << 7)
	| (p2.mode << 4)
	| (p2.padding2 << 3)
	| (p2.off_timer_set << 2)
	| (p2.on_timer_set << 1)
	| (p2.power);

    buffer[6] = p2.temperature;

    buffer[7] = p2.padding3;

    buffer[8] = (p2.fan_speed << 4) | (p2.vane_direction);

    buffer[9] = (p2.left_right << 4) | (p2.padding4);

    p2.timers.copy(buffer, 10);

    buffer[13] = 
	(p2.padding5 << 5)
	| (p2.silent << 4)
	| (p2.padding6 << 1)
	| (p2.powerful_mode);

    buffer[14] =
	(p2.intelligent_on << 7)
	| (p2.padding7);

    buffer[15] = p2.padding8;
    
    p2.rest.copy(buffer, 16);
    buffer[18] = checksum(buffer, 0, 18);
    return buffer;
};

const encode = (options) => {
    if (options.temperature) {
	options.temperature *= 2;
    }
    return [
	encodeP1Raw(defaultPacket1),
	encodeP2Raw(Object.assign({}, defaultPacket2, options)),
    ]
};

module.exports = {
    encode, MODE
};
