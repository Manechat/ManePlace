const FileSystem = require("fs");
const SmartBuffer = require("smart-buffer").SmartBuffer;
const PNG = require("pngjs").PNG;

function toPng(fromPath, toPath, sizeX, sizeY)
{
	const png = new PNG({ width: sizeX, height: sizeY });

	const buf = SmartBuffer.fromBuffer(FileSystem.readFileSync(fromPath));

	while(buf.remaining() > 0)
	{
		const x = buf.readUInt16BE();
		const y = buf.readUInt16BE();
		
		const red = buf.readUInt8();
		const green = buf.readUInt8();
		const blue = buf.readUInt8();

		const idx = (x + y * sizeX) * 4;
		png.data[idx + 0] = red;
		png.data[idx + 1] = green;
		png.data[idx + 2] = blue;
		png.data[idx + 3] = 255;

		const userId = buf.readBigUInt64BE();
		const timestamp = buf.readBigUInt64BE();
	}

	FileSystem.writeFileSync(toPath, PNG.sync.write(png));
}

function fromPng(fromPath, toPath, userId)
{
	const png = PNG.sync.read(FileSystem.readFileSync(fromPath));

	const buf = new SmartBuffer();

	const time = Date.now();

	for(let y = 0; y < png.height; ++y)
	{
		for(let x = 0; x < png.width; ++x)
		{
			const idx = (x + y * png.width) * 4;
			
			const red = png.data[idx + 0];
			const green = png.data[idx + 1];
			const blue = png.data[idx + 2];
			const alpha = png.data[idx + 3];

			if(alpha === 0)
			{
				continue;
			}

			buf.writeUInt16BE(x);
			buf.writeUInt16BE(y);

			buf.writeUInt8(red);
			buf.writeUInt8(green);
			buf.writeUInt8(blue);

			buf.writeBigInt64BE(BigInt(userId));
			buf.writeBigUInt64BE(BigInt(time));
		}
	}

	FileSystem.writeFileSync(toPath, buf.toBuffer());
}

toPng("./canvas/current_1.hst", "./current.png", 500, 500);
//fromPng("./base.png", "./current.hst", "245197038231355393");