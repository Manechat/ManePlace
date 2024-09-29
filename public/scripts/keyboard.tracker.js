import { LazyMap } from "./util.js";



/*
class Trackable
{
	constructor()
	{
		this._downTimestamp = 0;

		this._tickDuration = 0;
		this._tickInterval = null;
		this._initialDelay = 0;
		this._initialTimeout = null;

		this._ondown = null;
		this._onhold = null;
		this._onup = null;
	}

	pressed(func)
	{
		this._ondown = func;
		return this;
	}

	held()
	{
		const trackable = this;
		
		return {
			after(delay)
			{
				trackable._initialDelay = delay;
				return this;
			},

			every(duration)
			{
				trackable._tickDuration = duration;
				return this;
			},

			do(func)
			{
				trackable._onhold = func;
				return trackable;
			}
		};
	}

	released(func)
	{
		this._onup = func;
		return this;
	}

	press()
	{
		this._downTimestamp = Date.now();

		const skipDelay = this._ondown?.();

		 // Start holding unless there's no tick duration OR there's no pressed or hold handlers
		if (this._tickDuration <= 0 || !this._ondown && !this._onhold) return;

		const startHolding = () => this._tickInterval = setInterval(this.hold.bind(this), this._tickDuration);

		// Skip the initial delay if it was not specified or if the pressed function told us to
		if (skipDelay || this._initialDelay <= 0) startHolding();
		else this._initialTimeout = setTimeout(startHolding, this._initialDelay);
	}

	hold()
	{
		if (this._onhold) this._onhold(Date.now() - this._downTimestamp);
		else this._ondown();
	}

	release()
	{
		this._onup?.();
		this._initialTimeout = clearTimeout(this._initialTimeout);
		this._tickInterval = clearInterval(this._tickInterval);
	}

	isHeld()
	{
		return this._tickInterval != null;
	}
}
*/

class KeyState
{
	constructor(tracker)
	{
		this._tracker = tracker;

		this.down = false;

		this._downTimestamp = Number.MAX_SAFE_INTEGER;

		this._downListeners = null;
		this._upListeners = null;
	}

	get held()
	{
		return Date.now() - this._downTimestamp >= this._tracker.holdDelay;
	}

	onpress(func)
	{
		this._downListeners ??= [];
		this._downListeners.push(func);
	}

	onrelease(func)
	{
		this._upListeners ??= [];
		this._upListeners.push(func);
	}

	press(event)
	{
		this.down = true;
		this._downTimestamp = Date.now();
		if (this._downListeners) this._downListeners.forEach(f => f(event, this));
	}

	release(event)
	{
		this.down = false;
		this._downTimestamp = Number.MAX_SAFE_INTEGER;
		if (this._upListeners) this._upListeners.forEach(f => f(event, this));
	}
}

export default class KeyboardTracker
{
	constructor()
	{
		this._keyStates = new LazyMap(); // TODO: Limit what we track?

		this.holdDelay = 0;
	}

	attach()
	{
		document.addEventListener("keydown", e =>
		{
			const key = this.key(e.code);
			if (!key.down) key.press(e);
		});

		document.addEventListener("keyup", e =>
		{
			this.key(e.code).release(e);
		});

		return this;
	}

	delay(delay)
	{
		this.holdDelay = delay;
		return this;
	}

	key(key)
	{
		return this._keyStates.get(key, () => new KeyState(this));
	}
}