const usersChartElement = document.getElementById("users-chart");
let usersChart;

const pixelsChartElement = document.getElementById("pixels-chart");
let pixelsChart;

const colorsChartElement = document.getElementById("colors-chart");
let colorsChart;


const pixelCount = document.getElementById("pixel-count");
const daysSpent = document.getElementById("days-spent");
const hoursSpent = document.getElementById("hours-spent");

const userCount = document.getElementById("user-count");
const uniqueUserCount = document.getElementById("unique-user-count");

const loginButtonContainer = document.getElementById("login-button-container");
const personalStatsContainer = document.getElementById("personal-stats-container");

const hoursWasted = document.getElementById("hours-wasted");

const heatmap = document.getElementById("heatmap");



const favoriteColorsChartElement = document.getElementById("favorite-colors-chart");
let favoriteColorsChart;

const yourPixelsChartElement = document.getElementById("your-pixels-chart");
let yourPixelsChart;



const confettiSound = new Howl({ src: [ "../sounds/confetti.mp3" ], volume: 0.2 });



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
	return hslToHex(randomInt(0, 360), randomInt(42, 98), randomInt(40, 90));
}

Array.prototype.groupBy = function(criteria)
{
	return this.reduce((groupings, item) =>
	{
		const key = criteria(item);

		if(key != null) // also checks undefined
		{
			groupings[key] ??= [];
			groupings[key].push(item);
		}

		return groupings;
	}, {});
}

function startInterval(intervalTimeMs, action)
{
	setInterval(action, intervalTimeMs);
	action();
}

function objectToDataset(dataset, mapKey, mapValue, mapColor, properties)
{
	const labels = [];
	const data = [];
	let backgroundColor;

	for(const key in dataset)
	{
		labels.push(mapKey ? mapKey(key) : key);
		data.push(mapValue ? mapValue(dataset[key]) : dataset[key]);

		if(typeof mapColor === "function")
		{
			backgroundColor ??= [];
			backgroundColor.push(mapColor(key, dataset[key]));
		}
		else
		{
			backgroundColor = mapColor;
		}
	}

	return { labels, datasets: [ Object.assign(properties || {}, { data, backgroundColor }) ] };
}

startInterval(5 * 60 * 1000 /* 5 mins */, async () =>
{
	const res = await fetch("https://place.manechat.net/stats-json");
	const stats = await res.json();

	console.log(stats);

	pixelCount.innerHTML = stats.global.pixelCount;
	daysSpent.innerHTML = (stats.global.pixelCount / 24 / 60).toFixed(2);
	hoursSpent.innerHTML = (stats.global.pixelCount / 60).toFixed(2);

	userCount.innerHTML = stats.global.userCount;
	uniqueUserCount.innerHTML = stats.global.uniqueUserCount;

	const startTimeMs = Date.now() - 24 * 60 * 60 * 1000; // 24 hrs

	if(usersChart)
	{
		usersChart.destroy();
	}

	usersChart = new Chart(usersChartElement,
	{
		type: "line",
		data: objectToDataset(stats.global.userCountOverTime, key => Number(key), null, generateNiceHexColor(), { tension: 0.3 }),
		options:
		{
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: { x: { type: "time", min: startTimeMs } }
		}
	});

	if(pixelsChart)
	{
		pixelsChart.destroy();
	}

	pixelsChart = new Chart(pixelsChartElement,
	{
		type: "line",
		data: objectToDataset(stats.global.pixelCountOverTime, key => Number(key), null, generateNiceHexColor(), { tension: 0.1 }),
		options:
		{
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: { x: { type: "time", min: startTimeMs } }
		}
	});

	if(colorsChart)
	{
		colorsChart.destroy();
	}

	colorsChart = new Chart(colorsChartElement,
	{
		type: "bar",
		data: objectToDataset(stats.global.colorCounts, rgbIntToHex, null, rgbIntToHex),
		options:
		{
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
		}
	});



	if(!stats.personal)
	{
		loginButtonContainer.classList.remove("hidden");
		personalStatsContainer.classList.add("hidden");
		return;
	}

	loginButtonContainer.classList.add("hidden");
	personalStatsContainer.classList.remove("hidden");



	const heatmapScale = 2;

	// TODO Get this from the server
	heatmap.width = 500 * heatmapScale;
	heatmap.height = 500 * heatmapScale;
	heatmap.style.maxWidth = `${500 * heatmapScale}px`;
	heatmap.style.maxHeight = `${500 * heatmapScale}px`;

	const heatmapCtx = heatmap.getContext("2d");



	hoursWasted.innerHTML = (stats.personal.pixelEvents.length / 60).toFixed(2);



	const favoriteColorCounts = {};

	for(const pixelEvent of stats.personal.pixelEvents)
	{
		favoriteColorCounts[pixelEvent.color] ??= 0;
		favoriteColorCounts[pixelEvent.color]++;

		heatmapCtx.fillStyle = rgbIntToHex(pixelEvent.color);
		heatmapCtx.fillRect(pixelEvent.x * heatmapScale, pixelEvent.y * heatmapScale, heatmapScale, heatmapScale);
	}

	if(favoriteColorsChart)
	{
		favoriteColorsChart.destroy();
	}

	favoriteColorsChart = new Chart(favoriteColorsChartElement,
	{
		type: "bar",
		data: objectToDataset(favoriteColorCounts, rgbIntToHex, null, rgbIntToHex),
		options:
		{
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
		}
	});



	if(yourPixelsChart)
	{
		yourPixelsChart.destroy();
	}

	const yourStartTimeMs = Date.now() - 7 * 24 * 60 * 60 * 1000 /* 7 days */;
	const yourIntervalTimeMs = 60 * 60 * 1000 /* 60 min */;

	const yourPixelsOverTime = stats.personal.pixelEvents.groupBy(pixelEvent =>
	{
		const intervalStartTimeMs = Math.floor( (pixelEvent.timestamp - yourStartTimeMs) / yourIntervalTimeMs ) * yourIntervalTimeMs;

		return pixelEvent.timestamp < yourStartTimeMs ? undefined : intervalStartTimeMs + yourStartTimeMs;
	} );

	for(const timestamp in yourPixelsOverTime)
	{
		yourPixelsOverTime[timestamp] = yourPixelsOverTime[timestamp].length;
	}

	// all below is very YIKES
	let newTimeMs = yourStartTimeMs;

	const nowMs = Date.now();

	const newYourPixelsOverTime = {};

	while(newTimeMs < nowMs)
	{
		newYourPixelsOverTime[newTimeMs] = yourPixelsOverTime[newTimeMs] || 0;

		newTimeMs += yourIntervalTimeMs;
	}

	yourPixelsChart = new Chart(yourPixelsChartElement,
	{
		type: "line",
		data: objectToDataset(newYourPixelsOverTime, key => Number(key), null, generateNiceHexColor(), { tension: 0.3 }),
		options:
		{
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: { x: { type: "time", min: yourStartTimeMs, time: { unit: "days" }, ticks: { callback: val => new Date(val).toLocaleDateString("en-US", { weekday: "long" }) } } }
		}
	});
});

function login()
{
	window.location.href = "/auth/discord?from=stats";
}

function isElementInViewport(el)
{
	const rect = el.getBoundingClientRect();

	return rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
}

const confettiInterval = setInterval(() =>
{
	if(isElementInViewport(hoursWasted) && !personalStatsContainer.classList.contains("hidden"))
	{
		clearInterval(confettiInterval);

		const count = 200;
		const defaults = { origin: { y: 0.7 } };
	
		function fire(particleRatio, opts)
		{
			confetti(
			{
				...defaults,
				...opts,
				particleCount: Math.floor(count * particleRatio)
			});
		}
	
		fire(0.25, { spread: 26, startVelocity: 55, });
		fire(0.2, { spread: 60, });
		fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
		fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
		fire(0.1, { spread: 120, startVelocity: 45, });
	
		confettiSound.play();
	}
}, 200);