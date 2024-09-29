import FileSystem from "fs";
import Path from "path";
import { Event } from "./canvas.js";



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

export async function readEvents(canvas, path)
{
	const buf = BufferSlicer.from(await FileSystem.promises.readFile(path).catch(() => null));
	if (!buf) return;

	const version = buf.next(1).readUInt8();

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
			canvas.place(x, y, color, userId, timestamp);
		}
		else if (eventId === Event.EXPAND)
		{
			const nx = buf.next(2).readInt16LE();
			const ny = buf.next(2).readInt16LE();
			const px = buf.next(2).readInt16LE();
			const py = buf.next(2).readInt16LE();
			canvas.expand(nx, ny, px, py, userId, timestamp);
		}
		else if (eventId === Event.COLORS)
		{
			const count = buf.next(1).readUint8();
			const colors = Array(count).fill()
				.map(() => buf.next(3).readUintLE(0, 3));
			canvas.setColors(colors, userId, timestamp);
		}
		else if (eventId === Event.COOLDOWN)
		{
			const cooldown = buf.next(2).readInt16LE();
			canvas.setCooldown(cooldown, userId, timestamp);
		}
	}
}

const FILE_VERSION = 0;

export async function startWritingEvents(canvas, path)
{
	const stat = await FileSystem.promises.stat(path).catch(() => null);
	await FileSystem.promises.mkdir(Path.dirname(path), { recursive: true });
	const stream = FileSystem.createWriteStream(path, { flags: "a" });
	if (!stat) stream.write(Buffer.of(FILE_VERSION));

	canvas.on("dispatch", event =>
	{
		const header = BufferSlicer.from(Buffer.alloc(17));
		header.next(1).writeUint8(event.id);
		header.next(8).writeBigUint64LE(BigInt(event.timestamp));
		header.next(8).writeBigUint64LE(BigInt(event.userId));

		if (event.id === Event.PLACE)
		{
			const body = BufferSlicer.from(Buffer.alloc(7));
			body.next(2).writeInt16LE(event.x);
			body.next(2).writeInt16LE(event.y);
			body.next(3).writeUintLE(event.color, 0, 3);
			stream.write(Buffer.concat([ header.buffer(), body.buffer() ]));
		}
		else if (event.id === Event.EXPAND)
		{
			const body = BufferSlicer.from(Buffer.alloc(8));
			body.next(2).writeInt16LE(event.nx);
			body.next(2).writeInt16LE(event.ny);
			body.next(2).writeInt16LE(event.px);
			body.next(2).writeInt16LE(event.py);
			stream.write(Buffer.concat([ header.buffer(), body.buffer() ]));
		}
		else if (event.id === Event.COLORS)
		{
			const body = BufferSlicer.from(Buffer.alloc(1 + event.colors.length * 3));
			body.next(1).writeUint8(event.colors.length);
			for (const color of event.colors) body.next(3).writeUintLE(color, 0, 3);
			stream.write(Buffer.concat([ header.buffer(), body.buffer() ]));
		}
		else if (event.id === Event.COOLDOWN)
		{
			const body = BufferSlicer.from(Buffer.alloc(2));
			body.next(2).writeInt16LE(event.cooldown);
			stream.write(Buffer.concat([ header.buffer(), body.buffer() ]));
		}
	});
}

export async function readStats(stats, path)
{
	const statFile = await FileSystem.promises.readFile(path, { encoding: "utf-8" })
		.then(s => JSON.parse(s))
		.catch(() => null);
	
	if (statFile?.totalUserCountOverTime)
	{
		stats.totalUserCountOverTime = statFile.totalUserCountOverTime;
		stats.userCountOverTime = statFile.totalUserCountOverTime;
	}
	
	if (statFile?.mostConcurrentUsers)
	{
		stats.mostConcurrentUsers = statFile.mostConcurrentUsers;
	}
}

export function writeStats(stats, path)
{
	FileSystem.mkdirSync(Path.dirname(path), { recursive: true });
	FileSystem.writeFileSync(path, JSON.stringify({
		totalUserCountOverTime: stats.totalUserCountOverTime,
		mostConcurrentUsers: stats.mostConcurrentUsers
	}), { encoding: "utf-8" });
}

export function gracefulShutdown(...handlers) // TODO: On unhandled error as well
{
	const handler = () =>
	{
		for (const handler of handlers) handler();
		process.exit(0);
	};

	process.on("SIGINT", handler);
	process.on("SIGTERM", handler);
}