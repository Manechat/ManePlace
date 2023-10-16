const FileSystem = require("fs");
const SmartBuffer = require("smart-buffer").SmartBuffer;
const PNG = require("pngjs").PNG;

// copied from canvas.js
function readEvents(path)
{
	const events = [];

	const buf = SmartBuffer.fromBuffer(FileSystem.readFileSync(path));

	while(buf.remaining() > 0)
	{
		const x = buf.readUInt16BE();
		const y = buf.readUInt16BE();
		
		const color = buf.readBuffer(3).readUintBE(0, 3);

		const userId = Number(buf.readBigUInt64BE());
		const timestamp = buf.readBigUInt64BE().toString();

		events.push({ x, y, color, userId, timestamp });
	}

	return events;
}

// same
function writeEvents(events, path)
{
	const buf = new SmartBuffer();

	for(const event of events)
	{
		buf.writeUInt16BE(event.x);
		buf.writeUInt16BE(event.y);

		const colorBuf = Buffer.alloc(3);
		colorBuf.writeUIntBE(event.color, 0, 3);
		buf.writeBuffer(colorBuf);

		buf.writeBigInt64BE(BigInt(event.userId));
		buf.writeBigUInt64BE(BigInt(event.timestamp));
	}

	FileSystem.writeFileSync(path, buf.toBuffer());
}






function eventsToPng(events, path, sizeX, sizeY)
{
	const png = new PNG({ width: sizeX, height: sizeY });

	for(const event of events)
	{
		const idx = (event.x + event.y * sizeX) * 4;

		png.data.writeUintBE(event.color, idx, 3);
		png.data[idx + 3] = 255;
	}

	FileSystem.writeFileSync(path, PNG.sync.write(png));
}

function pngToEvents(path, userId)
{
	const png = PNG.sync.read(FileSystem.readFileSync(path));

	const timestamp = Date.now();

	const events = [];

	for(let y = 0; y < png.height; ++y)
	{
		for(let x = 0; x < png.width; ++x)
		{
			const idx = (x + y * png.width) * 4;
			
			const color = png.data.readUintBE(idx, 3);
			const alpha = png.data[idx + 3];

			if(alpha === 0)
			{
				continue;
			}

			events.push({ x, y, color, userId, timestamp });
		}
	}

	return events;
}

module.exports = { readEvents, writeEvents, eventsToPng, pngToEvents };