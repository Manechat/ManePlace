import EventEmitter from "events";
import { LazyMap } from "./util.js";



class RawImage
{
	constructor(sizeX, sizeY)
	{
		this.sizeX = sizeX;
		this.sizeY = sizeY;

		this.data = Buffer.alloc(sizeX * sizeY * 4, 255);
	}

	getOffset(x, y)
	{
		return (x + y * this.sizeX) * 4;
	}

	getColor(x, y)
	{
		return this.data.readUintBE(this.getOffset(x, y), 3);
	}

	setColor(x, y, color)
	{
		this.data.writeUIntBE(color, this.getOffset(x, y), 3);
	}

	copy(x, y, image)
	{
		// area of the source image to be pasted on (intersection)
		const sx1 = Math.max(x, 0);
		const sy1 = Math.max(y, 0);
		const sx2 = Math.min(x + image.sizeX, this.sizeX);
		const sy2 = Math.min(y + image.sizeY, this.sizeY);

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
}



export class ErrorCode
{
	static OUT_OF_BOUNDS = 0;
	static COLOR_NOT_FOUND = 1;
	static ON_COOLDOWN = 2;
	static CANVAS_CLOSED = 3;

	static UNSUPPORTED_EXPANSION = 100;

	static INVALID_COLOR = 1000;
}

export class Event
{
	static PLACE = 0;
	static EXPAND = 1;
	static COLORS = 2;
	static COOLDOWN = 3;
}

export class Canvas extends EventEmitter
{
	constructor()
	{
		super();

		this.image = new RawImage(0, 0);
		this.colors = [];
		this.cooldown = 0;

		this.pixelMap = new LazyMap();
		this.userMap = new LazyMap();

		this.pivotX = 0;
		this.pivotY = 0;
	}

	/*
	use(...conditions)
	{
		for (const condition of conditions)
		{
			for (const key in condition)
			{
				const func = this[key];
				const conditionFunc = condition[key];

				if (typeof func === "function" && typeof conditionFunc === "function")
				{
					this[key] = (...args) =>
					{
						const result = conditionFunc(...args);
						if (result) return result;
						return func(...args);
					};
				}
			}
		}

		return this;
	}
	*/

	getPlaceTimestampsFor(userId)
	{
		return this.userMap.get(userId)?.placeTimestamps;
	}

	getPlacer(x, y)
	{
		return this.pixelMap.get(x)?.get(y)?.userId;
	}

	place(x, y, color, userId, timestamp = Date.now()) // TODO: Bypass checks during read?
	{
		const absoluteX = x + this.pivotX;
		const absoluteY = y + this.pivotY;

		if (absoluteX < 0 || absoluteX > this.image.sizeX || absoluteY < 0 || absoluteY > this.image.sizeY) return { error: ErrorCode.OUT_OF_BOUNDS };
		if (!this.colors.includes(color)) return { error: ErrorCode.COLOR_NOT_FOUND };
		if (this.cooldown < 0) return { error: ErrorCode.CANVAS_CLOSED };

		const nextPlaceTimestamp = this.getPlaceTimestampsFor(userId)?.next;
		
		if (nextPlaceTimestamp > timestamp) return {
			error: ErrorCode.ON_COOLDOWN,
			remainingCooldown: nextPlaceTimestamp - timestamp,
			previousColor: this.image.getColor(absoluteX, absoluteY)
		};

		this.image.setColor(absoluteX, absoluteY, color);
		this.pixelMap.get(x, () => new LazyMap()).get(y, () => ( {} )).userId = userId;
		const placeTimestamps = this.userMap.get(userId, () => ( {} )).placeTimestamps ??= {};
		placeTimestamps.last = timestamp;
		placeTimestamps.next = timestamp + this.cooldown * 1000;

		this.emit("dispatch", { id: Event.PLACE, x, y, color, userId, timestamp });

		return { cooldown: placeTimestamps.next - placeTimestamps.last };
	}

	expand(nx, ny, px, py, userId, timestamp = Date.now())
	{
		if (nx < 0 || ny < 0 || px < 0 || py < 0) return { error: ErrorCode.UNSUPPORTED_EXPANSION };

		this.pivotX += nx;
		this.pivotY += ny;

		const oldImage = this.image;
		this.image = new RawImage(oldImage.sizeX + nx + px, oldImage.sizeY + ny + py);
		this.image.copy(nx, ny, oldImage);

		this.emit("dispatch", { id: Event.EXPAND, nx, ny, px, py, userId, timestamp });

		return {};
	}

	setColors(colors, userId, timestamp = Date.now())
	{
		if (colors.some(c => c < 0 || c > 16777215)) return { error: ErrorCode.INVALID_COLOR };

		this.colors = colors;

		this.emit("dispatch", { id: Event.COLORS, colors, userId, timestamp });

		return {};
	}

	setCooldown(cooldown, userId, timestamp = Date.now())
	{
		this.cooldown = cooldown;

		this.emit("dispatch", { id: Event.COOLDOWN, cooldown, userId, timestamp });

		return {};
	}
}