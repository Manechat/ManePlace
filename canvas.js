const FileSystem = require("fs");
const SmartBuffer = require("smart-buffer").SmartBuffer;
const EventEmitter = require("events");



/*
 * ===============================
*/

class ImageBuffer
{
	constructor(sizeX, sizeY)
	{
		this.sizeX = sizeX;
		this.sizeY = sizeY;

		this.data = Buffer.alloc(sizeX * sizeY * 4, 255);
	}

	calculateOffset(x, y)
	{
		return (x + y * this.sizeX) * 4;
	}

	getColor(x, y)
	{
		return this.data.readUintBE(this.calculateOffset(x, y), 3);
	}

	setColor(x, y, color)
	{
		this.data.writeUIntBE(color, this.calculateOffset(x, y), 3);
	}
}



const defaultUserData = {
	cooldown: 0
};



class UserDataStore
{
	constructor()
	{
		this._map = new Map();
	}

	get(userId)
	{
		userId = userId.toString();

		let userData = this._map.get(userId);

		if(!userData)
		{
			this._map.set(userId, userData = structuredClone(defaultUserData));
		}

		return userData;
	}

	[Symbol.iterator]()
	{
		return this._map.entries;
	}
}


const defaultCanvasSettings = {
	sizeX: 1000,
	sizeY: 1000,
	colors: [ 16711680, 65280, 255 ],
	maxCooldown: 60
};

function hexToInt(hex)
{
	if(typeof hex === "number")
	{
		return hex;
	}

	if(hex.startsWith("#"))
	{
		hex = hex.slice(1);
	}

	return Number(`0x${hex}`);
}

class Canvas extends EventEmitter
{
	constructor()
	{
		super();
		this.users = new UserDataStore();

		setInterval(this._update.bind(this), 1000);
	}

	initialize(settings)
	{
		this.settings = Object.assign(structuredClone(defaultCanvasSettings), settings);
		this.settings.colors = this.settings.colors.map(hexToInt);

		this.pixels = new ImageBuffer(this.settings.sizeX, this.settings.sizeY);
		this.info = new Array(this.settings.sizeX).fill(null).map(() => new Array(this.settings.sizeY).fill(null));
		
		return this;
	}

	_update()
	{
		for(const [ userId, data ] of this.users._map)
		{
			if(data.cooldown > 0)
			{
				--data.cooldown;
			}
		}
	}

	_setPixel(x, y, color, userId, timestamp)
	{
		this.pixels.setColor(x, y, color);
		this.info[x][y] = { userId, timestamp };
		this.emit("pixel", x, y, color, userId, timestamp);
	}

	isInBounds(x, y)
	{
		return parseInt(x) == x && parseInt(y) == y && x >= 0 && x < this.settings.sizeX && y >= 0 && y < this.settings.sizeY;
	}

	place(x, y, color, userId)
	{
		if(!this.isInBounds(x, y))
		{
			return false;
		}

		if(!this.settings.colors.includes(+color))
		{
			return false;
		}

		if(this.users.get(userId).cooldown > 0)
		{
			return false;
		}

		this._setPixel(x, y, color, userId, Date.now());

		this.users.get(userId).cooldown = this.settings.maxCooldown;

		return true;
	}
}



Canvas.IO = class
{
	constructor(canvas, path)
	{
		this._canvas = canvas;
		this._path = path;

		if(!FileSystem.existsSync(path))
		{
			FileSystem.writeFileSync(path, "");
		}

		this._stream = FileSystem.createWriteStream(path, { flags: "a" });

		canvas.addListener("pixel", this.writePixel.bind(this));
	}

	read()
	{
		const buf = SmartBuffer.fromBuffer(FileSystem.readFileSync(this._path));

		while(buf.remaining() > 0)
		{
			const x = buf.readUInt16BE();
			const y = buf.readUInt16BE();
			
			const color = buf.readBuffer(3).readUintBE(0, 3);

			const userId = buf.readBigUInt64BE();
			const timestamp = buf.readBigUInt64BE();

			this._canvas.pixels.setColor(x, y, color);
			this._canvas.info[x][y] = { userId, timestamp };
		}

		return this;
	}

	writePixel(x, y, color, userId, timestamp)
	{
		const buf = new SmartBuffer(); // TODO: re-use buffer

		buf.writeUInt16BE(x);
		buf.writeUInt16BE(y);
		const colorBuf = Buffer.alloc(3);
		colorBuf.writeUIntBE(color, 0, 3);
		buf.writeBuffer(colorBuf);
		buf.writeBigUInt64BE(BigInt(userId));
		buf.writeBigUInt64BE(BigInt(timestamp));

		this._stream.write(buf.toBuffer());
	}

	serializePixelWithoutTheOtherStuff(x, y, color)
	{
		const buf = new SmartBuffer();

		buf.writeUInt16BE(x);
		buf.writeUInt16BE(y);
		const colorBuf = Buffer.alloc(3);
		colorBuf.writeUIntBE(color, 0, 3);
		buf.writeBuffer(colorBuf);

		return buf.toBuffer();
	}
}



/*
 * ===============================
*/

module.exports = Canvas;