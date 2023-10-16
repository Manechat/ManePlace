const Converter = require("./converter");
const Encoder = require("h264-mp4-encoder");
const FileSystem = require("fs");



// copied from canvas.js then modified
class ScaledImageBuffer
{
	constructor(sizeX, sizeY, scale)
	{
		this.sizeX = sizeX;
		this.sizeY = sizeY;
		this.scale = scale;

		this.data = Buffer.alloc(sizeX * sizeY * scale * scale * 4, 255);
	}

	_calculateOffset(x, y)
	{
		return (x + y * this.sizeX * this.scale) * 4;
	}

	_setColor(x, y, color)
	{
		this.data.writeUIntBE(color, this._calculateOffset(x, y), 3);
	}

	setColor(x, y, color)
	{
		for(let dx = 0; dx < this.scale; ++dx)
		{
			for(let dy = 0; dy < this.scale; ++dy)
			{
				this._setColor(x * this.scale + dx, y * this.scale + dy, color);
			}
		}
	}
}



async function create(width, height, scale, speed, frameRate, pathToCanvas, pathToTimelapse) // TODO: this asumes the events are in sorted order
{
	const encoder = await Encoder.createH264MP4Encoder();
	encoder.width = width * scale;
	encoder.height = height * scale;
	encoder.frameRate = frameRate;
	encoder.quantizationParameter = 10;
	encoder.outputFilename = pathToTimelapse;

	encoder.initialize();

	const pixelEvents = Converter.readEvents(pathToCanvas);
	const imageBuffer = new ScaledImageBuffer(width, height, scale);

	const startTimeMs = pixelEvents[0].timestamp;

	let pixelNum = 0;

	let lastFrameNum = 0;

	console.log("0%");

	for(const pixelEvent of pixelEvents)
	{
		const timeSinceStartMs = (pixelEvent.timestamp - startTimeMs) / speed;
		const frameNum = Math.floor(timeSinceStartMs / 1000 * frameRate);

		const frameDelta = frameNum - lastFrameNum;

		if(frameDelta > 0) // switched to the next frame
		{
			// if multiple frames happened with no activity, copy the current canvas to these frames
			// also set the canvas image for the current frame
			for(let skippedFrameNum = lastFrameNum + 1; skippedFrameNum <= frameNum; ++skippedFrameNum)
			{
				encoder.addFrameRgba(Buffer.from(imageBuffer.data));
			}
		}

		imageBuffer.setColor(pixelEvent.x, pixelEvent.y, pixelEvent.color);

		lastFrameNum = frameNum;

		const progress = Math.floor((pixelNum / pixelEvents.length) * 10);
		const newProgress = Math.floor((++pixelNum / pixelEvents.length) * 10);

		if(progress !== newProgress)
		{
			console.log((newProgress * 10) + "%");
		}
	}

	encoder.finalize();
	const out = encoder.FS.readFile(encoder.outputFilename);
	encoder.delete();

	FileSystem.writeFileSync(pathToTimelapse, out);
}

create(500, 500, 4, 10000, 60, "../canvas/current.hst", "./timelapse.mp4");