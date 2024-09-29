import StateTracker from "../scripts/state.tracker.js";
import AudioMixer from "../scripts/audio.mixer.js";
import * as Components from "./scripts/stats.components.js";



// ============ Setup ===============

const COMPONENT_STATE = StateTracker({
	sizeX: 0,
	sizeY: 0,
	pivotX: 0,
	pivotY: 0,
	pixelCount: 0,
	pixelCountByColor: {},
	pixelCountOverTime: {},
	pixelCountInterval: 0,
	userCount: 0,
	uniqueUserCount: 0,
	userCountOverTime: {},
	hasPersonalStats: false,
	personalPixels: []
});

const MIXER = new AudioMixer(new AudioContext());
MIXER.getChannel("master").gain.value = 0.2;



// ============ Assets ===============

const CONFETTI_SOUND = await MIXER.load("../assets/sounds/confetti.mp3");



// ============ Setup elements ===============

COMPONENT_STATE.subscribe("pixelCount", Components.PixelCountComponent());
COMPONENT_STATE.subscribe("userCount", Components.UserCountComponent());
COMPONENT_STATE.subscribe("uniqueUserCount", Components.UniqueUserCountComponent());
COMPONENT_STATE.subscribe("mostConcurrentUsers", Components.MostConcurrentUsersComponent());
COMPONENT_STATE.subscribe("userCountOverTime", Components.UserCountChartComponent());
COMPONENT_STATE.subscribe("pixelCountOverTime", "pixelCountInterval", Components.PixelCountChartComponent());
COMPONENT_STATE.subscribe("pixelCountByColor", Components.ColorChartComponent());
COMPONENT_STATE.subscribe("hasPersonalStats", Components.LoginButtonComponent());
COMPONENT_STATE.subscribe("hasPersonalStats", Components.YourStatsComponent());
COMPONENT_STATE.subscribe("personalPixels", Components.YourPixelCountComponent());
COMPONENT_STATE.subscribe("personalPixels", "sizeX", "sizeY", "pivotX", "pivotY", Components.YourPixelMapComponent(2));
COMPONENT_STATE.subscribe("personalPixels", Components.YourFavoriteColorsChartComponent());
COMPONENT_STATE.subscribe("personalPixels", Components.YourPixelCountChart(1 * 60 * 60 * 1000));

document.getElementById("login-button").onclick = () => window.location.href = "/login?from=stats";



// ============ Load data ===============

async function loadStats()
{
	const stats = await fetch("../statistics").then(r => r.json());

	console.info(stats);

	COMPONENT_STATE.pixelCount = stats.global.pixelCount;
	COMPONENT_STATE.pixelCountByColor = stats.global.pixelCountByColor;
	COMPONENT_STATE.pixelCountOverTime = stats.global.pixelCountOverTime;
	COMPONENT_STATE.pixelCountInterval = stats.global.pixelCountInterval;
	COMPONENT_STATE.userCount = stats.global.userCount;
	COMPONENT_STATE.uniqueUserCount = stats.global.uniqueUserCount;
	COMPONENT_STATE.userCountOverTime = stats.global.userCountOverTime;
	COMPONENT_STATE.mostConcurrentUsers = stats.global.mostConcurrentUsers;

	if (!stats.personal) return;

	const canvas = await fetch("../canvas/state").then(r => r.json());

	COMPONENT_STATE.sizeX = canvas.sizeX;
	COMPONENT_STATE.sizeY = canvas.sizeY;
	COMPONENT_STATE.pivotX = canvas.pivotX;
	COMPONENT_STATE.pivotY = canvas.pivotY;

	COMPONENT_STATE.hasPersonalStats = true;
	COMPONENT_STATE.personalPixels = stats.personal.pixels;
}

await loadStats();



// ============ Easter egg ===============

let congratulated = false;

function congratulate()
{
	if (congratulated) return;

	congratulated = true;

	const fire = (particleRatio, opts) =>
	{
		confetti({ origin: { y: 0.7 }, particleCount: Math.floor(200 * particleRatio), ...opts });
	}

	fire(0.25, { spread: 26, startVelocity: 55, });
	fire(0.2, { spread: 60, });
	fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
	fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
	fire(0.1, { spread: 120, startVelocity: 45, });

	CONFETTI_SOUND.play();
}

const OBSERVER = new IntersectionObserver(entries =>
{
	for (const e of entries) if (e.intersectionRatio > 0) congratulate();
}, { threshold: 1 });

OBSERVER.observe(document.getElementById("favorite-colors-chart"));