// ============= Utility =============

function createChart(element, type, scales)
{
	return new Chart(element, {
		type: type,
		options: {
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			elements: { point: { radius: 0 } },
			scales
		}
	});
}

class Dataset
{
	constructor(object)
	{
		this._object = object;

		this._sorter = null;
		this._keyMapper = null;
		this._valueMapper = null;
		this._propertyMapper = {};
	}

	static from(object)
	{
		return new Dataset(object);
	}

	sort(sorter)
	{
		this._sorter = sorter;
		return this;
	}

	keys(mapper)
	{
		this._keyMapper = mapper;
		return this;
	}

	values(mapper)
	{
		this._valueMapper = mapper;
		return this;
	}

	with(mapper)
	{
		Object.assign(this._propertyMapper, mapper);
		return this;
	}

	create()
	{
		const entries = Object.entries(this._object);
		if (this._sorter) entries.sort(this._sorter);

		const labels = [];
		const data = [];

		for(const [ key, value ] of entries)
		{
			labels.push(this._keyMapper ? this._keyMapper(key) : key);
			data.push(this._valueMapper ? this._valueMapper(value) : value);
		}

		const dataset = { data };

		for (const property in this._propertyMapper)
		{
			const value = this._propertyMapper[property];
			dataset[property] = typeof value === "function" ? entries.map(e => value(...e)) : value;
		}

		return { labels, datasets: [ dataset ] };
	}
}

// Pad an aligned timestamp -> count map with zeroes during idle moments
function padIdleCounts(events, interval)
{
	const first = Math.min(...Object.keys(events));
	const now = Date.now();

	for (let timestamp = first; timestamp < now; timestamp += interval)
	{
		events[timestamp] ??= 0;
	}
}

function rgbIntToHex(rgbInt)
{
	return "#" + Number(rgbInt).toString(16).padStart(6, "0");
}

// https://stackoverflow.com/questions/36721830/convert-hsl-to-rgb-and-hex
function hslToHex(h, s, l)
{
	l /= 100;

	const a = s * Math.min(l, 1 - l) / 100;

	const f = n =>
	{
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color).toString(16).padStart(2, "0");
	}

	return `#${f(0)}${f(8)}${f(4)}`;
}

function randomInt(min, max)
{
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// https://gist.github.com/bendc/76c48ce53299e6078a76
function generateNiceHexColor()
{
	return hslToHex(randomInt(0, 360), randomInt(42, 98), randomInt(40, 60));
}

function align(number, alignment)
{
	return Math.floor(number / alignment) * alignment;
}





// ============= Components =============

export function PixelCountComponent()
{
	const element = document.getElementById("pixel-count");

	return state => // pixelCount
	{
		element.textContent = state.pixelCount;
	};
}

export function UserCountComponent()
{
	const element = document.getElementById("user-count");

	return state => // userCount
	{
		element.textContent = state.userCount;
	};
}

export function UniqueUserCountComponent()
{
	const element = document.getElementById("unique-user-count");

	return state => // uniqueUserCount
	{
		element.textContent = state.uniqueUserCount;
	};
}

export function MostConcurrentUsersComponent()
{
	const element = document.getElementById("max-concurrent-user-count");

	return state => // mostConcurrentUsers
	{
		element.textContent = state.mostConcurrentUsers;
	};
}

export function UserCountChartComponent()
{
	const chart = createChart(document.getElementById("users-chart"), "line", { x: { type: "time", /* min: startTimeMs */ }, y: { beginAtZero: true } });

	return state => // userCountOverTime
	{
		const color = generateNiceHexColor();

		chart.data = Dataset.from(state.userCountOverTime)
			.sort(([ k1 ], [ k2 ]) => k1 - k2)
			.keys(k => +k)
			.with({ borderColor: color })
			.with({ backgroundColor: color + "40" })
			.with({ fill: true })
			.with({ borderWidth: 0.95 })
			.create();

		chart.update();
	};
}

export function PixelCountChartComponent()
{
	const chart = createChart(document.getElementById("pixels-chart"), "line", { x: { type: "time", /* min: startTimeMs */ } });

	return state => // pixelCountOverTime, pixelCountInterval
	{
		const pixelCountOverTime = { ...state.pixelCountOverTime };
		padIdleCounts(pixelCountOverTime, state.pixelCountInterval || 10 * 60 * 1000);
		
		const color = generateNiceHexColor();

		chart.data = Dataset.from(pixelCountOverTime)
			.sort(([ k1 ], [ k2 ]) => k1 - k2)
			.keys(k => +k)
			.with({ backgroundColor: color + "40" })
			.with({ borderColor: color })
			.with({ fill: true })
			.with({ borderWidth: 0.95 })
			.create();

		chart.update();
	};
}

export function ColorChartComponent()
{
	const chart = createChart(document.getElementById("colors-chart"), "bar");

	return state => // pixelCountByColor
	{
		chart.data = Dataset.from(state.pixelCountByColor)
			.keys(rgbIntToHex)
			.with({ backgroundColor: rgbIntToHex })
			.create();

		chart.update();
	};
}

export function LoginButtonComponent()
{
	const element = document.getElementById("login-button-container");

	return state => // hasPersonalStats
	{
		element.classList.toggle("hidden", state.hasPersonalStats);
	};
}

export function YourStatsComponent()
{
	const element = document.getElementById("personal-stats-container");

	return state => // hasPersonalStats
	{
		element.classList.toggle("hidden", !state.hasPersonalStats);
	};
}

export function YourPixelCountComponent()
{
	const element = document.getElementById("your-pixels");

	return state => // personalPixels
	{
		element.textContent = state.personalPixels.length;
	};
}

export function YourPixelMapComponent(scale)
{
	const element = document.getElementById("heatmap");

	return state => // personalPixels, sizeX, sizeY, pivotX, pivotY
	{
		element.width = state.sizeX * scale;
		element.height = state.sizeY * scale;

		const ctx = element.getContext("2d");

		for (const pixel of state.personalPixels)
		{
			ctx.fillStyle = rgbIntToHex(pixel.color);
			ctx.fillRect((pixel.x + state.pivotX) * scale, (pixel.y + state.pivotY) * scale, scale, scale);
		}
	};
}

export function YourFavoriteColorsChartComponent()
{
	const chart = createChart(document.getElementById("favorite-colors-chart"), "bar");

	return state => // personalPixels
	{
		const favoriteColorCounts = {};

		for (const pixel of state.personalPixels)
		{
			favoriteColorCounts[pixel.color] ??= 0;
			favoriteColorCounts[pixel.color]++;
		}

		chart.data = Dataset.from(favoriteColorCounts)
			.keys(rgbIntToHex)
			.with({ backgroundColor: rgbIntToHex })
			.create();

		chart.update();
	};
}

export function YourPixelCountChart(interval)
{
	const scales = { x: { type: "time", time: { unit: "days" }, ticks: { callback: v => new Date(v).toLocaleDateString("en-US", { weekday: "long" }) } } };
	const chart = createChart(document.getElementById("your-pixels-chart"), "line", scales);

	return state => // personalPixels
	{
		const yourPixelCountOverTime = {};

		for (const pixel of state.personalPixels)
		{
			const alignedTimestamp = align(pixel.timestamp, interval);
			yourPixelCountOverTime[alignedTimestamp] ??= 0;
			yourPixelCountOverTime[alignedTimestamp]++;
		}

		padIdleCounts(yourPixelCountOverTime, interval);

		const color = generateNiceHexColor();

		chart.data = Dataset.from(yourPixelCountOverTime)
			.sort(([ k1 ], [ k2 ]) => k1 - k2)
			.keys(k => +k)
			.with({ borderColor: color })
			.with({ backgroundColor: color + "40" })
			.with({ fill: true })
			.with({ borderWidth: 0.95 })
			.create();

		chart.update();
	};
}