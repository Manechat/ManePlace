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




class UserDataStore
{
	constructor(defaultUserData)
	{
		this._defaultUserData = defaultUserData;
		this._map = new Map();
	}

	get(userId)
	{
		userId = userId.toString();

		let userData = this._map.get(userId);

		if(!userData)
		{
			this._map.set(userId, userData = structuredClone(this._defaultUserData));
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

const defaultCanvasUserData = { cooldown: 0 };

class Canvas extends EventEmitter
{
	constructor()
	{
		super();
		this.pixelEvents = [];
		this.users = new UserDataStore(defaultCanvasUserData);

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
		this.pixelEvents.push({ x, y, color, userId, timestamp });
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

		const timestamp = Date.now();
		this._setPixel(x, y, color, userId, timestamp);
		this.emit("pixel", x, y, color, userId, timestamp);

		this.users.get(userId).cooldown = this.settings.maxCooldown;

		return true;
	}
}



Canvas.IO = class extends EventEmitter
{
	constructor(canvas, path)
	{
		super();
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

			const userId = buf.readBigUInt64BE().toString();
			const timestamp = Number(buf.readBigUInt64BE());

			this._canvas._setPixel(x, y, color, userId, timestamp);

			this.emit("read", x, y, color, userId, timestamp);
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




const defaultUserStats = { pixelEvents: [] };

Canvas.Stats = class
{
	constructor(canvas, io, getConnectedUserCount)
	{
		this.canvas = canvas;
		this.getConnectedUserCount = getConnectedUserCount;

		this.global = {
			uniqueUserCount: 0,
			colorCounts: {},
			//
			userCountOverTime: {},
			pixelCountOverTime: {}
		};

		this.personal = new UserDataStore(defaultUserStats);
		
		//

		canvas.addListener("pixel", this._updateRealTime.bind(this));
		io.addListener("read", this._updateRealTime.bind(this));

		// TODO: Yucky!
		if(FileSystem.existsSync("./canvas/userCountOverTime.json"))
		{
			this.global.userCountOverTime = JSON.parse(FileSystem.readFileSync("./canvas/userCountOverTime.json", { encoding: "utf-8" }));
		}
	}

	startRecording(intervalMs, durationMs)
	{
		this._recordingIntervalMs = intervalMs;
		this._recordingDurationMs = durationMs;

		Utils.startInterval(this._recordingIntervalMs, this._updateAtInterval.bind(this));
	}

	_updateRealTime(x, y, color, userId, timestamp)
	{
		this.global.colorCounts[color] ??= 0;
		this.global.colorCounts[color]++;

		this.personal.get(userId).pixelEvents.push({ x, y, color, userId, timestamp });
	}

	_updateAtInterval()
	{
		console.log("Updated stats");

		const currentTimeMs = Date.now();
		const startTimeMs = currentTimeMs - this._recordingDurationMs;
		const intervalTimeMs = this._recordingIntervalMs;



		this.global.uniqueUserCount = new Set(this.canvas.pixelEvents.map(pixelEvent => pixelEvent.userId)).size; // TODO: update in real time?



		for(const timestamp in this.global.userCountOverTime)
		{
			if(timestamp < startTimeMs)
			{
				delete this.global.userCountOverTime[timestamp];
			}
		}

		this.global.userCountOverTime[currentTimeMs] = this.getConnectedUserCount();

		// TODO: Yucky!
		FileSystem.writeFileSync("./canvas/userCountOverTime.json", JSON.stringify(this.global.userCountOverTime));



		// TODO This will break if there are periods of 0 placement
		// TOOD So we need to fill out those intervals manually, make sure they are present
		this.global.pixelCountOverTime = this.canvas.pixelEvents.groupBy(pixelEvent =>
		{
			const intervalStartTimeMs = Math.floor( (pixelEvent.timestamp - startTimeMs) / intervalTimeMs ) * intervalTimeMs;
	
			return pixelEvent.timestamp < startTimeMs ? undefined : intervalStartTimeMs + startTimeMs;
		} );

		for(const timestamp in this.global.pixelCountOverTime)
		{
			this.global.pixelCountOverTime[timestamp] = this.global.pixelCountOverTime[timestamp].length;
		}
	}
}



/*
 * ===============================
*/

module.exports = Canvas;