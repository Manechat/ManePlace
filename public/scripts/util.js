export function loadImage(src)
{
	return new Promise((resolve, reject) =>
	{
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = reject;
		image.src = src;
	})
}

export async function loadFile(src)
{
	const res = await fetch(src);
	const body = await res.text();
	return body;
}



export function renderLoop(render)
{
	let then = 0;

	const compositeRender = now =>
	{
		now /= 1000;
		const delta = now - then;
		then = now;

		render(now, delta);
		requestAnimationFrame(compositeRender);
	};

	requestAnimationFrame(compositeRender);
}



export function formatMinutesAndSeconds(seconds)
{
	const m = Math.floor(seconds / 3600 / 60).toString().padStart(2, "0");
	const s = Math.floor(seconds % 60).toString().padStart(2, "0");
	return `${m}:${s}`;
}



export class LazyMap extends Map
{
	get(key, provider)
	{
		let value = super.get(key);
		if (!value && provider) this.set(key, value = provider());
		return value;
	}
}