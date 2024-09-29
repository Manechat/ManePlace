export class LazyMap extends Map
{
	get(key, provider)
	{
		let value = super.get(key);
		if (!value && provider) this.set(key, value = provider(key));
		return value;
	}
}



export function intersects(a, b)
{
	return a && b ? a.some(e => b.includes(e)) : false;
}

export function align(number, alignment)
{
	return Math.floor(number / alignment) * alignment;
}