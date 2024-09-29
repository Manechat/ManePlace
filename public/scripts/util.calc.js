export function clamp(value, min, max)
{
	return Math.min(Math.max(value, min), max);
}

export function lerp(start, end, progress)
{
	return start + (end - start) * progress;
}

// Visualize with http://www.demofox.org/bezcubic1d.html
export function cubicBezier1d(anchor1, anchor2, progress)
{
	const omp = 1 - progress;
	return 3 * omp * omp * progress * anchor1 + 3 * omp * progress * progress * anchor2 + progress * progress * progress;
}

export function unpackRGB(value)
{
	const r = value >> 16 & 0xFF;
	const g = value >> 8 & 0xFF;
	const b = value & 0xFF;
	return [ r, g, b ];
}

export function hexToInt(hex)
{
	if (hex.startsWith("#")) hex = hex.slice(1);
	return Number(`0x${hex}`);
}

export function intToHex(int)
{
	return "#" + int.toString(16).padStart(6, "0");
}

export function nearestPowerOfTwo(x)
{
  return 2 ** Math.round(Math.log(x) / Math.log(2));
}