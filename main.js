import Polka from "polka";
import Sirv from "sirv";
import Compress from "@polka/compression";
import { helpers, json, session } from "./middleware.js";
import { Canvas } from "./canvas.js";
import * as IO from "./canvas.io.js";
import Path from "path";
import FileSystem from "fs/promises";
import Query from "querystring";
import * as Discord from "./discord.api.js";
import { intersects } from "./util.js";
import ChannelTracker from "./channel.tracker.js";
import Statistics from "./canvas.stats.js";



// TODO: Add /api/... path to all endpoints (Polka is dogshit and wouldn't allow me to mount middleware like that)

// ---------------- Discord ----------------

const DISCORD = new Discord.Client(process.env.DISCORD_TOKEN, Discord.Intent.GUILDS | Discord.Intent.GUILD_MEMBERS);

DISCORD._gatewayClient.on("close", (c, r) => console.log(new Date().toLocaleString(), c, r));
DISCORD._gatewayClient.on("error", e => console.log(new Date().toLocaleString(), e));

await DISCORD.login().then(u => console.log(`Logged in as ${u.username}`));



class UserStatus
{
	static LOGGED_OUT = 0;
	static NOT_IN_SERVER = 1;
	static BANNED = 2;
	static LOGGED_IN = 10;
	static ADMIN = 11;
}

async function getUserStatus(userId) // TODO: middleware?
{
	if (!userId) return UserStatus.LOGGED_OUT;

	const member = await DISCORD.getGuildMember(CONFIG.guildId, userId);

	if (!member) return UserStatus.NOT_IN_SERVER;
	else if (intersects(member.roles, CONFIG.adminRoles)) return UserStatus.ADMIN;
	else if (intersects(member.roles, CONFIG.bannedRoles)) return UserStatus.BANNED;
	return UserStatus.LOGGED_IN;
}



// ---------------- Canvas ----------------

const CHANNELS = new ChannelTracker();

const CONFIG = await FileSystem.readFile(Path.join(import.meta.dirname, "data", "config.json"))
	.then(s => JSON.parse(s))
	.catch(() => ( {} ));

const CANVAS = new Canvas()
const STATS = new Statistics(
	CONFIG.pixelCountInterval || 10 * 60 * 1000,
	CONFIG.pixelCountWindow || 24 * 60 * 60 * 1000,
	CONFIG.userCountInterval || 10 * 60 * 1000,
	CONFIG.userCountWindow || 24 * 60 * 60 * 1000
).listen(CANVAS, CHANNELS);

const STATS_PATH = Path.join(import.meta.dirname, "data", "stats.json");
await IO.readStats(STATS, STATS_PATH);

const EVENTS_PATH = Path.join(import.meta.dirname, "data", "events.bin");
await IO.readEvents(CANVAS, EVENTS_PATH);
await IO.startWritingEvents(CANVAS, EVENTS_PATH);

IO.gracefulShutdown( () => IO.writeStats(STATS, STATS_PATH) );



// ---------------- Server ----------------

const SERVER = Polka();
SERVER.use(Sirv(Path.join(import.meta.dirname, "public")), helpers, session());



// ---------------- Auth ----------------

SERVER.get("/login", (req, res) =>
{
	const query = Query.encode({
		client_id: process.env.DISCORD_CLIENT_ID,
		response_type: "code",
		redirect_uri: `http://${req.headers.host}/login/redirect`,
		scope: "identify",
		state: req.query.from // So we can redirect back to stats
	});

	res.redirect(`https://discord.com/oauth2/authorize?${ query }`);
});

SERVER.get("/login/redirect", async (req, res) =>
{
	const code = req.query.code;
	const redirect = `/${ req.query.state || "" }`;

	if (!code) return res.redirect(redirect);

	const query = {
		client_id: process.env.DISCORD_CLIENT_ID,
		client_secret: process.env.DISCORD_CLIENT_SECRET,
		grant_type: "authorization_code",
		redirect_uri: `http://${req.headers.host}/login/redirect`,
		code,
	};

	const exchange = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: Query.encode(query) })
		.then(r => r.json())
		.catch(() => null);

	if (exchange?.token_type && exchange?.access_token)
	{
		const user = await fetch("https://discord.com/api/users/@me", { headers: { "Authorization": `${exchange.token_type} ${exchange.access_token}` } })
			.then(r => r.json())
			.catch(() => null);

		if (user) res.createSession({ userId: user.id });
	}

	res.redirect(redirect);
});

SERVER.delete("/logout", (req, res) =>
{
	if (!req?.session?.userId) return res.end("Already logged out");

	res.deleteSession(req.session.sessionId);

	res.end("Logged out");
});



// ---------------- Get canvas ----------------

SERVER.use("/canvas", Compress({ level: 4 }));
SERVER.get("/canvas", (_, res) =>
{
	res.end(CANVAS.image.data);
});



// ---------------- Get canvas state ----------------

SERVER.get("/canvas/state", async (req, res) =>
{
	const placeTimestamps = CANVAS.getPlaceTimestampsFor(req.session?.userId);
	res.json({
		sizeX: CANVAS.image.sizeX,
		sizeY: CANVAS.image.sizeY,
		pivotX: CANVAS.pivotX,
		pivotY: CANVAS.pivotY,
		colors: CANVAS.colors,
		cooldown: CANVAS.cooldown,
		userStatus: await getUserStatus(req.session?.userId),
		placeTimestamp: placeTimestamps?.last ?? 0,
		nextPlaceTimestamp: placeTimestamps?.next ?? 0,
		guildName: CONFIG.guildName, // TODO: Automatically get name and invite/vanity link?
		guildInvite: CONFIG.guildInvite,
	});
});



// ---------------- Place ----------------

SERVER.use("/place", json);
SERVER.post("/place", async (req, res) =>
{
	if (!Number.isInteger(req.body.x) || !Number.isInteger(req.body.y) || !Number.isInteger(req.body.color)) return res.status(400).end();
	if (!req.session?.userId) return res.status(401).end();
	if (await getUserStatus(req.session.userId) < UserStatus.LOGGED_IN) return res.status(403).end();

	res.json(CANVAS.place(req.body.x, req.body.y, req.body.color, req.session.userId));
});



// ---------------- Get placer ----------------

SERVER.use("/placer", json);
SERVER.post("/placer", async (req, res) =>
{
	if (!Number.isInteger(req.body.x) || !Number.isInteger(req.body.y)) return res.status(400).end();

	const userId = CANVAS.getPlacer(req.body.x, req.body.y);
	const member = await DISCORD.getGuildMember(CONFIG.guildId, userId);

	res.json({ placer: member?.nick || member?.user?.global_name || member?.user?.username }); // TODO: Name for users not in the server
});



// ---------------- Events ----------------

SERVER.get("/events", (req, res) =>
{
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Connection": "keep-alive",
		"Cache-Control": "no-cache"
	});

	CHANNELS.open(res);
	req.on("close", () => CHANNELS.close(res));
});

CANVAS.on("dispatch", event =>
{
	const data = Object.assign({}, event);
	delete data.userId,
	delete data.timestamp;
	CHANNELS.sendAll("dispatch", data);
});



// ---------------- Mod tools ----------------

// TODO: Change paths to /tools/etc or similar
SERVER.use("/expand", json);
SERVER.post("/expand", async (req, res) =>
{
	if (!Number.isInteger(req.body.nx) || !Number.isInteger(req.body.ny) || !Number.isInteger(req.body.px) || !Number.isInteger(req.body.py)) return res.status(400).end();
	if (!req.session?.userId) return res.status(401).end();
	if (await getUserStatus(req.session.userId) !== UserStatus.ADMIN) return res.status(403).end();

	res.json(CANVAS.expand(req.body.nx, req.body.ny, req.body.px, req.body.py, req.session.userId));
});

SERVER.use("/colors", json);
SERVER.post("/colors", async (req, res) =>
{
	if (!Array.isArray(req.body.colors) || req.body.colors.some(c => !Number.isInteger(c))) return res.status(400).end();
	if (!req.session?.userId) return res.status(401).end();
	if (await getUserStatus(req.session.userId) !== UserStatus.ADMIN) return res.status(403).end();

	res.json(CANVAS.setColors(req.body.colors, req.session.userId));
});

SERVER.use("/cooldown", json);
SERVER.post("/cooldown", async (req, res) =>
{
	if (!Number.isInteger(req.body.cooldown)) return res.status(400).end();
	if (!req.session?.userId) return res.status(401).end();
	if (await getUserStatus(req.session.userId) !== UserStatus.ADMIN) return res.status(403).end();

	res.json(CANVAS.setCooldown(req.body.cooldown, req.session.userId));
});



// ---------------- Stats ----------------

SERVER.use("/statistics", Compress({ level: 4 }));
SERVER.get("/statistics", (req, res) =>
{
	const stats = {};

	stats.global = {
		pixelCount: STATS.pixelCount,
		pixelCountByColor: STATS.pixelCountByColor,
		pixelCountOverTime: STATS.pixelCountsOverTime,
		pixelCountInterval: STATS.pixelCountInterval,
		userCount: CHANNELS.getChannelCount(),
		uniqueUserCount: STATS.personal.size,
		userCountOverTime: STATS.userCountOverTime,
		mostConcurrentUsers: STATS.mostConcurrentUsers,
	};

	if (req.session?.userId) stats.personal = STATS.getPersonal(req.session.userId);

	res.json(stats);
});



// ---------------- Start ----------------

SERVER.listen(5000, () => console.log(`Server started on port 5000`));