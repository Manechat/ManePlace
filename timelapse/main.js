import Encoder from "h264-mp4-encoder";
import FileSystem from "node:fs";
import { createInterface } from "node:readline/promises";
import EventEmitter from "node:events";



class ScaledRawImage
{
	constructor(sizeX, sizeY, scale)
	{
		this.sizeX = sizeX;
		this.sizeY = sizeY;
		this.scale = scale;

		this.actualSizeX = sizeX * scale;
		this.actualSizeY = sizeY * scale;

		this.data = Buffer.alloc(this.actualSizeX * this.actualSizeY * 4, 255);
	}

	getOffset(x, y)
	{
		return (x + y * this.actualSizeX) * 4;
	}

	getColor(x, y)
	{
		return this.data.readUintBE(this.getOffset(x, y), 3);
	}

	getColorScaled(x, y)
	{
		return this.getColor(x * this.scale, y * this.scale);
	}

	setColor(x, y, color)
	{
		this.data.writeUIntBE(color, this.getOffset(x, y), 3);
	}

	setColorScaled(x, y, color)
	{
		for (let dx = 0; dx < this.scale; ++dx)
		{
			for (let dy = 0; dy < this.scale; ++dy)
			{
				this.setColor(x * this.scale + dx, y * this.scale + dy, color);
			}
		}
	}

	paste(x, y, image)
	{
		// area of the source image to be pasted on (intersection)
		const sx1 = Math.max(x, 0);
		const sy1 = Math.max(y, 0);
		const sx2 = Math.min(x + image.actualSizeX, this.actualSizeX);
		const sy2 = Math.min(y + image.actualSizeY, this.actualSizeY);

		// area of the target image to be pasted
		const tx1 = sx1 - x;
		const ty1 = sy1 - y;
		const tx2 = sx2 - x;
		const ty2 = sy2 - y;

		// copy target line-by-line
		for (let dy = 0; dy < ty2 - ty1; ++dy)
		{
			image.data.copy(this.data, this.getOffset(sx1, sy1 + dy), image.getOffset(tx1, ty1 + dy), image.getOffset(tx2, ty1 + dy));
		}
	}

	pasteScaled(x, y, image)
	{
		this.paste(x * this.scale, y * this.scale, image);
	}
}

// TODO: Stop copying shit from my other code and make it global somehow
class BufferSlicer
{
	constructor(buffer)
	{
		this._buffer = buffer;

		this._offset = 0;
	}

	static from(buffer)
	{
		return buffer ? new BufferSlicer(buffer) : null;
	}

	buffer()
	{
		return this._buffer;
	}

	remaining()
	{
		return this._buffer.length - this._offset;
	}

	next(bytes)
	{
		const slice = this._buffer.subarray(this._offset, this._offset + bytes);
		this._offset += bytes;
		return slice;
	}
}

// TODO: Same
export class Event
{
	static PLACE = 0;
	static EXPAND = 1;
	static COLORS = 2;
	static COOLDOWN = 3;
}

class EventReader extends EventEmitter
{
	read(buf)
	{
		buf = BufferSlicer.from(buf);

		const version = buf.next(1).readUInt8();

		if (version !== 0) throw new Error(`Unsupported version ${version}`);

		while (buf.remaining() > 0)
		{
			const eventId = buf.next(1).readUint8();
			const timestamp = Number(buf.next(8).readBigUint64LE());
			const userId = buf.next(8).readBigUint64LE().toString();
			
			if (eventId === Event.PLACE)
			{
				const x = buf.next(2).readInt16LE();
				const y = buf.next(2).readInt16LE();
				const color = buf.next(3).readUintLE(0, 3);
				this.emit("place", x, y, color, userId, timestamp);
			}
			else if (eventId === Event.EXPAND)
			{
				const nx = buf.next(2).readInt16LE();
				const ny = buf.next(2).readInt16LE();
				const px = buf.next(2).readInt16LE();
				const py = buf.next(2).readInt16LE();
				this.emit("expand", nx, ny, px, py, userId, timestamp)
			}
			else if (eventId === Event.COLORS)
			{
				const count = buf.next(1).readUint8();
				const colors = Array(count).fill()
					.map(() => buf.next(3).readUintLE(0, 3));
				this.emit("colors", colors, userId, timestamp)
			}
			else if (eventId === Event.COOLDOWN)
			{
				const cooldown = buf.next(2).readInt16LE();
				this.emit("cooldown", cooldown, userId, timestamp);
			}
		}
	}
}


// ================================

async function generateTimelapse()
{
	const reader = createInterface(process.stdin, process.stdout);

	const path = await reader.question("Path to events file:");
	const eventsBuf = await FileSystem.promises.readFile(path).catch(() => null);

	if (!eventsBuf)
	{
		console.log(`File '${path}' doesn't exist`);
		return reader.close();
	}

	// TODO: input validation
	const speed = +await reader.question("Speed multiplier (1x = real time, 2x = twice as fast, etc):");
	const fps = +await reader.question("Frame rate:");
	const scale = +await reader.question("Video scale:");
	const startTimeIn = +await reader.question("Starting timestamp (ms, optional):");
	reader.close();

	// Find the total size

	let sizeX = 0;
	let sizeY = 0;

	let pivotX = 0;
	let pivotY = 0;

	let pixels = 0;

	{
		const events = new EventReader();
		events.on("expand", (nx, ny, px, py) =>
		{
			sizeX += nx + px;
			sizeY += ny + py;

			pivotX += nx;
			pivotY += ny;
		});
		events.on("place", () =>
		{
			++pixels;
		});
		events.read(eventsBuf);
	}

	// Actually generate the video

	const image = new ScaledRawImage(sizeX, sizeY, scale);

	const encoder = await Encoder.createH264MP4Encoder();
	encoder.width = image.actualSizeX;
	encoder.height = image.actualSizeY;
	encoder.frameRate = fps;
	encoder.quantizationParameter = 10; // TODO: wtf is this
	encoder.outputFilename = "./timelapse.mp4";
	encoder.initialize();

	let startTime = startTimeIn;
	let lastFrameNum = 0;
	let pixelNum = 0;

	{
		const events = new EventReader();
		events.on("expand", () =>
		{
			// TODO: add code to visually show expansions (current we don't do that)
		});
		events.on("place", (x, y, color, _, timestamp) =>
		{
			if (startTime <= 0) startTime = timestamp;

			// calculate the frame number for this timestamp
			const frameNum = Math.floor((timestamp - startTime) / speed / 1000 * fps);

			// set the canvas image for the current frame
			// also if multiple frames happened with no activity, copy the current canvas to these frames
			for(let skippedFrameNum = lastFrameNum + 1; skippedFrameNum <= frameNum; ++skippedFrameNum)
			{
				encoder.addFrameRgba(image.data);
			}

			image.setColorScaled(x + pivotX, y + pivotY, color);

			if (frameNum >= 0) lastFrameNum = frameNum;

			// Log progress in multiples of 10

			const progress = Math.floor((pixelNum / pixels) * 100);
			const newProgress = Math.floor((++pixelNum / pixels) * 100);
	
			if(progress !== newProgress) console.log(newProgress + "%");
		});
		events.read(eventsBuf);
	}

	encoder.finalize();
	const out = encoder.FS.readFile(encoder.outputFilename);
	encoder.delete();
	await FileSystem.promises.writeFile("./timelapse.mp4", out);
}

generateTimelapse();