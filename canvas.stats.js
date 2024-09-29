import { LazyMap } from "./util.js";
import { Event } from "./canvas.js";
import * as Util from "./util.js";



export default class Statistics
{
	constructor(pixelCountInteval, pixelCountWindow, userCountInterval, userCountWindow)
	{
		this.pixelCountInterval = pixelCountInteval;
		this.pixelCountWindow = pixelCountWindow;
		this.userCountInterval = userCountInterval;
		this.userCountWindow = userCountWindow;

		this.pixelCount = 0;
		this.pixelCountByColor = {};
		this.pixelCountsOverTime = {};

		this.totalUserCountOverTime = {};
		this.userCountOverTime = {};
		this.mostConcurrentUsers = 0;

		this.personal = new LazyMap();

		this._channels = null;
	}

	getPersonal(userId)
	{
		return this.personal.get(userId, () => ( { pixels: [] } ));
	}

	listen(canvas, channels)
	{
		this._channels = channels;
		canvas.on("dispatch", this.savePixel.bind(this));
		channels.on("open", this.saveUserCount.bind(this));
		channels.on("close", this.saveUserCount.bind(this));
		return this;
	}

	savePixel(event) // on every place event...
	{
			if (event.id !== Event.PLACE) return;

			const alignedTimestamp = Util.align(event.timestamp, this.pixelCountInterval);

			// Update our cached counts
			this.pixelCount++;
			this.pixelCountByColor[event.color] ??= 0;
			this.pixelCountByColor[event.color]++;

			const lowerBound = Date.now() - this.pixelCountWindow;

			// Only add if within our window
			if (event.timestamp >= lowerBound)
			{
				this.pixelCountsOverTime[alignedTimestamp] ??= 0;
				this.pixelCountsOverTime[alignedTimestamp]++;
			}

			// Delete old entries outside our window
			for (const timestamp in this.pixelCountsOverTime)
			{
				if (+timestamp < lowerBound) delete this.pixelCountsOverTime[timestamp];
			}

			if (event.userId > 0) this.getPersonal(event.userId).pixels.push(event); // TODO: Proper snowflake validation?
	}

	saveUserCount(event) // on every user change event...
	{
		const alignedTimestamp = Util.align(event.timestamp, this.userCountInterval);
		const count = this._channels.getChannelCount();

		// Add to the total count list
		this.totalUserCountOverTime[alignedTimestamp] = count;
		// And update the max users
		if (count > this.mostConcurrentUsers) this.mostConcurrentUsers = count;

		const lowerBound = Date.now() - this.userCountWindow;

		// Only add to current count list if within our window
		if (event.timestamp >= lowerBound)
		{
			const count = this._channels.getChannelCount();
			this.userCountOverTime[alignedTimestamp] = count;
		}

		// Delete old entries outside our window
		for (const timestamp in this.userCountOverTime)
		{
			if (+timestamp < lowerBound) delete this.userCountOverTime[timestamp];
		}
	}
} 