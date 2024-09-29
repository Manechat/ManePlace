import * as Calc from "./util.calc.js";



// TODO: Index animations by object reference instead of string?

export default class Animator
{
	constructor()
	{
		this._animations = new Map();
	}

	animate(name, animationFunc, durationMs)
	{
		const animation = new Animation(animationFunc, durationMs, performance.now());
		this._animations.set(name, animation);
	}

	cancel(name)
	{
		this._animations.delete(name);
	}

	tick(timeMs)
	{
		for (const [ name, animation ] of this._animations)
		{
			const progress = animation.getProgress(timeMs);
			animation._animationFunc(progress);
			if (progress >= 1) this._animations.delete(name);
		}
	}
}

class Animation
{
	constructor(animationFunc, durationMs, startTimeMs)
	{
		this._animationFunc = animationFunc;
		this._durationMs = durationMs;
		this._startTimeMs = startTimeMs;
	}

	getProgress(timeMs)
	{
		return Calc.clamp((timeMs - this._startTimeMs) / this._durationMs, 0, 1);
	}
}