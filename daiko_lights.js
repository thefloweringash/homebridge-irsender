const commandHeader = Buffer.from([133, 251]);

const writeByte = (buffer, offset, channel, byte) => {
    const byteWithChannel = (channel & 1) << 7 | byte;
    buffer[offset]     =        byteWithChannel;
    buffer[offset + 1] = 0xFF - byteWithChannel;
    return buffer;
}


const rawCommand = (channel, b1, b2) => {
    const longPacket = !!b2;
    const buffer = Buffer.alloc(longPacket ? 6 : 4);
    commandHeader.copy(buffer);

    writeByte(buffer, 2, channel, b1);
    if (longPacket) {
        writeByte(buffer, 4, channel, b2);
    }
    return buffer;
}

const COMMANDS = {
    OFF:    0,
    TOGGLE: 5,
    WHITE:  40,
    FULL:   41,
    WARM:   42
};

const CHANNELS = {
    ONE: 0,
    TWO: 1,
};

class DaikoLights {
    constructor(channel) {
        this.channel = channel;
    }

    command(b1, b2) {
        return rawCommand(this.channel, b1, b2);
    }

    off()    { return this.command(COMMANDS.OFF);   }
    toggle() { return this.command(COMMANDS.TOGGLE);}
    white()  { return this.command(COMMANDS.WHITE); }
    full()   { return this.command(COMMANDS.FULL);  }
    warm()   { return this.command(COMMANDS.WARM);  }

    nightLight(intensity) {
        return this.command(intensity <= 7 ? intensity + 5 : intensity + 8);
    }

    on(warmth, brightness) {
        return this.command(warmth + 28, brightness + 18);
    }
}

DaikoLights.CHANNELS = CHANNELS;

module.exports = DaikoLights;
